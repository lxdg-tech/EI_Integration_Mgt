type RuntimeWindow = Window & {
  __IRP_API_BASE_URL__?: unknown;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function resolveFromRuntimeOverride(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const runtimeWindow = window as RuntimeWindow;
  const runtimeValue = String(runtimeWindow.__IRP_API_BASE_URL__ ?? '').trim();

  return runtimeValue ? normalizeBaseUrl(runtimeValue) : '';
}

export function resolveApiBaseUrl(): string {
  const runtimeOverride = resolveFromRuntimeOverride();
  if (runtimeOverride) {
    return runtimeOverride;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }

  const { protocol, hostname, port } = window.location;
  const normalizedHostname = hostname.toLowerCase();
  const isLocalDevPort = port === '4200' || port === '8000';
  const isLocalHost =
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1';
  const isLanDevHost =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(normalizedHostname) ||
    normalizedHostname.endsWith('.local');

  if (isLocalHost || (isLocalDevPort && isLanDevHost)) {
    // Local API server runs on port 3000 via `npm run start:api`.
    return `${protocol}//${hostname}:3000`;
  }

  // In deployed environments, default to same-origin so reverse-proxy/api-gateway routes keep working.
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
}
