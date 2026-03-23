<#
.SYNOPSIS
    Builds and deploys the Integration Resource Planner to AWS Lambda.

.DESCRIPTION
    1. Builds the Angular frontend (ng build)
    2. Packages the Lambda zip (code + production node_modules)
    3. Uploads the zip to Lambda via update-function-code (env vars are NEVER touched)
    4. Verifies required environment variables are present in Lambda after deploy
    5. Runs a health-check invocation to confirm the function is live

.NOTES
    - Run from the integration-resource-planner/ directory (or the workspace root)
    - Requires AWS CLI v2 with an active SSO session: aws login --profile default
    - Lambda function: irp-api-prod  |  Region: us-west-2
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Config ────────────────────────────────────────────────────────────────────
$FunctionName = 'irp-api-prod'
$Region       = 'us-west-2'
$ZipPath      = '.lambda-api-package.zip'
$PkgDir       = '.lambda-api-package'

# Required Lambda environment variable keys – deployment will warn if any are missing
$RequiredEnvKeys = @(
    'LDAP_URL',
    'LDAP_BASE_DN',
    'LDAP_DOMAIN',
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
    'DB_NAME',
    'DB_USER',
    'DB_PASS',
    'DB_WRITER_HOST',
    'DB_READER_HOST'
)

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "    [FAIL] $msg" -ForegroundColor Red; exit 1 }

# ── Locate project root ───────────────────────────────────────────────────────
# Support running from workspace root OR from inside integration-resource-planner/
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = $PWD.Path }

if (Test-Path (Join-Path $ScriptDir 'angular.json')) {
    $ProjectRoot = $ScriptDir
} elseif (Test-Path (Join-Path $ScriptDir 'integration-resource-planner\angular.json')) {
    $ProjectRoot = Join-Path $ScriptDir 'integration-resource-planner'
} else {
    Write-Fail "Cannot find angular.json. Run deploy.ps1 from the project root."
}

Set-Location $ProjectRoot
Write-Step "Project root: $ProjectRoot"

# ── Step 1: Verify AWS auth ───────────────────────────────────────────────────
Write-Step "Verifying AWS authentication..."
$CallerIdentity = aws sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "AWS session expired. Run: aws login --profile default"
}
Write-Ok "Authenticated as: $($CallerIdentity | ConvertFrom-Json | Select-Object -ExpandProperty Arn)"

# ── Step 2: Build Angular ─────────────────────────────────────────────────────
Write-Step "Building Angular frontend..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail "Angular build failed." }
Write-Ok "Angular build complete."

# ── Step 3: Package Lambda zip ────────────────────────────────────────────────
Write-Step "Packaging Lambda zip..."

if (Test-Path $PkgDir) { Remove-Item -Recurse -Force $PkgDir }
New-Item -ItemType Directory -Path $PkgDir | Out-Null

# Copy application files
Copy-Item lambda.js          $PkgDir\
Copy-Item package.json       $PkgDir\
Copy-Item package-lock.json  $PkgDir\
Copy-Item -Recurse server    $PkgDir\server
Copy-Item -Recurse dist      $PkgDir\dist
if (Test-Path public) { Copy-Item -Recurse public $PkgDir\public }

# Install production-only dependencies
Push-Location $PkgDir
npm install --omit=dev --ignore-scripts
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Fail "npm install failed." }
Pop-Location

# Create zip (BOM-free UTF8 for all paths)
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    (Resolve-Path $PkgDir).Path,
    (Join-Path $ProjectRoot $ZipPath)
)
$SizeMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Ok "Lambda zip created: $ZipPath ($SizeMB MB)"

# ── Step 4: Upload to Lambda (code only – env vars are NEVER modified) ────────
Write-Step "Uploading code to Lambda '$FunctionName'..."
$UpdateResult = aws lambda update-function-code `
    --region $Region `
    --function-name $FunctionName `
    --zip-file "fileb://$ZipPath" `
    --output json 2>&1 | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) { Write-Fail "Lambda update-function-code failed." }
Write-Ok "Code uploaded. LastModified: $($UpdateResult.LastModified)"

# Wait for update to complete
Write-Step "Waiting for Lambda update to stabilize..."
aws lambda wait function-updated --region $Region --function-name $FunctionName
Write-Ok "Lambda update complete."

# ── Step 5: Verify required environment variables ─────────────────────────────
Write-Step "Verifying Lambda environment variables..."
$EnvVars = aws lambda get-function-configuration `
    --region $Region `
    --function-name $FunctionName `
    --query "Environment.Variables" `
    --output json | ConvertFrom-Json

$MissingKeys = @()
foreach ($key in $RequiredEnvKeys) {
    if ($null -eq $EnvVars.$key -or $EnvVars.$key -eq '') {
        $MissingKeys += $key
        Write-Warn "Missing env var: $key"
    } else {
        Write-Ok "$key = OK"
    }
}

# Specifically validate LDAP_BASE_DN format (must contain DC= components)
$BaseDN = $EnvVars.LDAP_BASE_DN
if ($BaseDN -and -not ($BaseDN -match 'DC=\w+,DC=\w+')) {
    Write-Warn "LDAP_BASE_DN looks incomplete: '$BaseDN' (expected format: DC=utility,DC=pge,DC=com)"
}

if ($MissingKeys.Count -gt 0) {
    Write-Warn "The following required Lambda env vars are not set: $($MissingKeys -join ', ')"
    Write-Warn "Set them via AWS Console or run: aws lambda update-function-configuration ..."
    Write-Warn "Deployment continues, but the application may not work correctly."
}

# ── Step 6: Health check ──────────────────────────────────────────────────────
Write-Step "Running Lambda health check..."
$HealthEvent = '{"version":"2.0","routeKey":"GET /api/health","rawPath":"/api/health","rawQueryString":"","headers":{"host":"lambda"},"requestContext":{"http":{"method":"GET","path":"/api/health","sourceIp":"127.0.0.1","userAgent":"deploy-script"}},"isBase64Encoded":false}'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$HealthEventFile = Join-Path $ProjectRoot '.deploy-health-event.json'
$HealthResponseFile = Join-Path $ProjectRoot '.deploy-health-response.json'
[System.IO.File]::WriteAllText($HealthEventFile, $HealthEvent, $utf8NoBom)

aws lambda invoke `
    --region $Region `
    --function-name $FunctionName `
    --payload "fileb://$HealthEventFile" `
    --cli-binary-format raw-in-base64-out `
    $HealthResponseFile --output json | Out-Null

$HealthBody = Get-Content $HealthResponseFile -Raw
Write-Ok "Health check response: $HealthBody"

# Cleanup temp files
Remove-Item -Force $HealthEventFile, $HealthResponseFile -ErrorAction SilentlyContinue

Write-Host "`n==> Deployment complete!" -ForegroundColor Green
