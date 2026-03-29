import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

type TimeReportRow = Record<string, string | number | null>;

@Component({
  selector: 'app-upload-time-report',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="upload-time-page">
      <section class="upload-time-card">
        <h1>Upload Time Report</h1>
        <p class="helper-text">
          Upload a CSV or Excel file to preview time report data.
        </p>

        <div class="upload-section">
          <label for="file-input" class="file-input-label">
            Choose File
            <input
              id="file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              (change)="onFileSelected($any($event.target).files)"
              class="file-input"
            />
          </label>

          @if (fileError()) {
            <p class="error-message">{{ fileError() }}</p>
          }

          @if (uploadedFileName()) {
            <p class="success-message">✓ File loaded: {{ uploadedFileName() }}</p>
          }
        </div>

        @if (fileRows().length > 0) {
          <div class="grid-section">
            <div class="grid-header">
              <h2>File Contents</h2>
              <p class="row-count">{{ fileRows().length }} row(s)</p>
            </div>
            
            <div class="grid-wrapper">
              <table class="data-grid">
                <thead>
                  <tr>
                    @for (header of gridHeaders(); track header) {
                      <th>{{ header }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of fileRows(); track $index) {
                    <tr>
                      @for (header of gridHeaders(); track header) {
                        <td>{{ row[header] ?? '-' }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <div class="button-row">
          <button type="button" class="close-btn" (click)="backToAdministration()">
            Back to Administration
          </button>
        </div>
      </section>
    </main>
  `,
  styles: `
    .upload-time-page {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .upload-time-card {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    h1 {
      color: #1f90cf;
      margin: 0 0 1rem;
      font-size: 1.75rem;
    }

    h2 {
      color: #1f4d85;
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
    }

    .helper-text {
      color: #555;
      margin: 0 0 1.5rem;
    }

    .upload-section {
      margin-bottom: 2rem;
      padding: 1.5rem;
      background: #f9f9f9;
      border: 1px dashed #d0d0d0;
      border-radius: 6px;
    }

    .file-input-label {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: #1f90cf;
      color: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.3s;
    }

    .file-input-label:hover {
      background: #1676b3;
    }

    .file-input {
      display: none;
    }

    .error-message {
      margin: 0.75rem 0 0;
      color: #d32f2f;
      font-weight: 600;
    }

    .success-message {
      margin: 0.75rem 0 0;
      color: #388e3c;
      font-weight: 600;
    }

    .grid-section {
      margin-top: 2rem;
    }

    .grid-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .row-count {
      color: #666;
      font-size: 0.9rem;
      margin: 0;
    }

    .grid-wrapper {
      border: 1px solid #d0d0d0;
      border-radius: 6px;
      overflow-x: auto;
    }

    .data-grid {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .data-grid thead {
      background: #f0f4f8;
      border-bottom: 2px solid #1f4d85;
    }

    .data-grid th {
      padding: 0.75rem;
      text-align: left;
      font-weight: 700;
      color: #1f4d85;
      border-right: 1px solid #d0d0d0;
    }

    .data-grid th:last-child {
      border-right: none;
    }

    .data-grid td {
      padding: 0.75rem;
      border-right: 1px solid #e0e0e0;
      border-bottom: 1px solid #e0e0e0;
      color: #333;
    }

    .data-grid td:last-child {
      border-right: none;
    }

    .data-grid tbody tr:hover {
      background: #f9f9f9;
    }

    .button-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 2rem;
      gap: 1rem;
    }

    .close-btn {
      border: 1px solid #1f4d85;
      background: #1f4d85;
      color: #fff;
      border-radius: 6px;
      padding: 0.55rem 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.3s;
    }

    .close-btn:hover {
      background: #173c69;
    }
  `,
})
export class UploadTimeReportComponent {
  protected readonly fileRows = signal<TimeReportRow[]>([]);
  protected readonly fileError = signal('');
  protected readonly uploadedFileName = signal('');
  protected readonly gridHeaders = signal<string[]>([]);

  constructor(private readonly router: Router) {}

  protected onFileSelected(files: FileList | null): void {
    this.fileError.set('');
    this.fileRows.set([]);
    this.uploadedFileName.set('');
    this.gridHeaders.set([]);

    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    this.uploadedFileName.set(file.name);

    if (file.name.endsWith('.csv')) {
      void this.parseCSV(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      void this.parseExcel(file);
    } else {
      this.fileError.set('Unsupported file format. Please upload a CSV or Excel file.');
    }
  }

  private parseCSV(file: File): void {
    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const content = event.target?.result as string;
        const lines = content.trim().split('\n');
        
        if (lines.length === 0) {
          this.fileError.set('CSV file is empty.');
          return;
        }

        // Parse header row
        const headers = lines[0].split(',').map(h => h.trim());
        this.gridHeaders.set(headers);

        // Parse data rows
        const rows: TimeReportRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row: TimeReportRow = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || null;
          });
          rows.push(row);
        }

        this.fileRows.set(rows);
      } catch (error) {
        this.fileError.set(
          `Error parsing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    };

    reader.onerror = () => {
      this.fileError.set('Error reading file. Please try again.');
    };

    reader.readAsText(file);
  }

  private parseExcel(file: File): void {
    // For simplicity, treat Excel as CSV-like format
    // Excel files with .xlsx/.xls extensions require SheetJS library
    // For now, we'll provide guidance to user to export as CSV
    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const data = event.target?.result as ArrayBuffer;
        // Excel files in binary format require SheetJS library
        // Display message prompting CSV conversion
        this.fileError.set(
          'Tip: Excel files (.xlsx/.xls) require additional processing. ' +
          'For best results, export your file as CSV and upload again.'
        );
      } catch (error) {
        this.fileError.set(
          `Error parsing Excel: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    };
    reader.readAsArrayBuffer(file);
  }

  protected backToAdministration(): void {
    void this.router.navigateByUrl('/admin');
  }
}