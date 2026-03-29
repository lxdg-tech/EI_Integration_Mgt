import { Component, signal } from '@angular/core';
import { resolveApiBaseUrl } from './api-base-url';

type DailyOpReviewViewRow = {
  id: number;
  reportingDate: string;
  assignedResource: string;
  projectName: string;
  workOrderNumber: string;
  plannedForTheDay: string;
  issuesAndBlockers: string;
  catchbackPlan: string;
};

@Component({
  selector: 'app-daily-operating-review',
  standalone: true,
  template: `
    <section class="dor-panel">
      <h2>Daily Operating Review</h2>

      <div class="field-row">
        <label for="reportingDate">Reporting Date</label>
        <input
          id="reportingDate"
          name="reportingDate"
          type="date"
          [value]="reportingDate()"
          (input)="onReportingDateChange($any($event.target).value)"
        />
      </div>

      <div class="action-row">
        <button type="button" class="action-btn" (click)="openAddEntry()">Add</button>
        <button type="button" class="action-btn" (click)="viewEntriesByReportingDate()">
          {{ isLoadingView() ? 'Loading...' : 'View' }}
        </button>
        <button type="button" class="action-btn" (click)="openUpdateEntriesByReportingDate()">
          {{ isLoadingView() ? 'Loading...' : 'Update' }}
        </button>
      </div>

      @if (viewError()) {
        <p class="field-error view-status">{{ viewError() }}</p>
      }

      @if (viewMessage()) {
        <p class="view-message view-status">{{ viewMessage() }}</p>
      }

      @if (viewRows().length) {
        <section class="view-panel" aria-label="Daily Operating Review Reports">
          <div class="view-header-row">
            <h3>
              {{ isUpdateMode() ? 'Update Daily Operating Review Reports' : 'Daily Operating Review Reports' }}
            </h3>

            @if (!isUpdateMode()) {
              <button type="button" class="small-btn" (click)="exportViewToExcel()">
                Export to Excel
              </button>
            }
          </div>
          <div class="table-wrap">
            <table class="dor-table">
              <thead>
                <tr>
                  <th>Reporting Date</th>
                  <th>Assigned Resource</th>
                  <th>Project Name</th>
                  <th>Work Order#</th>
                  <th>Planned for the day</th>
                  <th>Issues & Blockers</th>
                  <th>Catchback Plan</th>
                  @if (isUpdateMode()) {
                    <th>Actions</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of viewRows(); track row.id) {
                  <tr>
                    @if (isUpdateMode()) {
                      <td>
                        <input
                          type="date"
                          [value]="row.reportingDate"
                          (input)="onUpdateField(row.id, 'reportingDate', $any($event.target).value)"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          [value]="row.assignedResource"
                          (input)="onUpdateField(row.id, 'assignedResource', $any($event.target).value)"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          [value]="row.projectName"
                          (input)="onUpdateField(row.id, 'projectName', $any($event.target).value)"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          [value]="row.workOrderNumber"
                          (input)="onUpdateField(row.id, 'workOrderNumber', $any($event.target).value)"
                        />
                      </td>
                      <td>
                        <textarea
                          rows="2"
                          [value]="row.plannedForTheDay"
                          (input)="onUpdateField(row.id, 'plannedForTheDay', $any($event.target).value)"
                        ></textarea>
                      </td>
                      <td>
                        <textarea
                          rows="2"
                          [value]="row.issuesAndBlockers"
                          (input)="onUpdateField(row.id, 'issuesAndBlockers', $any($event.target).value)"
                        ></textarea>
                      </td>
                      <td>
                        <textarea
                          rows="2"
                          [value]="row.catchbackPlan"
                          (input)="onUpdateField(row.id, 'catchbackPlan', $any($event.target).value)"
                        ></textarea>
                      </td>
                      <td class="row-actions">
                        <button
                          type="button"
                          class="small-btn"
                          [disabled]="isSavingUpdateId() === row.id"
                          (click)="saveUpdatedRow(row)"
                        >
                          {{ isSavingUpdateId() === row.id ? 'Saving...' : 'Save' }}
                        </button>
                        <button
                          type="button"
                          class="small-btn danger"
                          [disabled]="isDeletingRowId() === row.id"
                          (click)="deleteRow(row.id)"
                        >
                          {{ isDeletingRowId() === row.id ? 'Deleting...' : 'Delete' }}
                        </button>
                      </td>
                    } @else {
                      <td>{{ row.reportingDate }}</td>
                      <td>{{ row.assignedResource }}</td>
                      <td>{{ row.projectName }}</td>
                      <td>{{ row.workOrderNumber }}</td>
                      <td>{{ row.plannedForTheDay || '-' }}</td>
                      <td>{{ row.issuesAndBlockers || '-' }}</td>
                      <td>{{ row.catchbackPlan || '-' }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      @if (showAddEntry()) {
        <section class="entry-panel" aria-label="Daily Operating Review Data Entry">
          <h3>Add Daily Operating Review Entry</h3>

          <div class="entry-grid">
            <div class="field-row">
              <label for="assignedResource">Assigned Resource</label>
              <select
                id="assignedResource"
                name="assignedResource"
                [value]="selectedAssignedResource()"
                [disabled]="isLoadingAssignedResources()"
                (change)="onAssignedResourceChange($any($event.target).value)"
              >
                <option value="">Select resource</option>
                @if (isLoadingAssignedResources()) {
                  <option value="" disabled>Loading resources...</option>
                }
                @for (resource of assignedResources(); track resource) {
                  <option [value]="resource">{{ resource }}</option>
                }
              </select>
              @if (assignedResourceError()) {
                <p class="field-error">{{ assignedResourceError() }}</p>
              }
            </div>

            <div class="field-row">
              <label for="projectName">Project Name</label>
              <select
                id="projectName"
                name="projectName"
                [value]="selectedProjectName()"
                [disabled]="!selectedAssignedResource() || isLoadingProjectNames()"
                (change)="onProjectNameChange($any($event.target).value)"
              >
                <option value="">Select project</option>
                @if (isLoadingProjectNames()) {
                  <option value="" disabled>Loading projects...</option>
                }
                @for (projectName of projectNames(); track projectName) {
                  <option [value]="projectName">{{ projectName }}</option>
                }
              </select>
              @if (projectNameError()) {
                <p class="field-error">{{ projectNameError() }}</p>
              }
            </div>

            <div class="field-row">
              <label for="workOrderNumber">Work Order#</label>
              <select
                id="workOrderNumber"
                name="workOrderNumber"
                [value]="selectedWorkOrderNumber()"
                [disabled]="!selectedAssignedResource() || !selectedProjectName() || isLoadingWorkOrders()"
                (change)="onWorkOrderChange($any($event.target).value)"
              >
                <option value="">Select work order</option>
                @if (isLoadingWorkOrders()) {
                  <option value="" disabled>Loading work orders...</option>
                }
                @for (workOrder of workOrders(); track workOrder) {
                  <option [value]="workOrder">{{ workOrder }}</option>
                }
              </select>
              @if (workOrderError()) {
                <p class="field-error">{{ workOrderError() }}</p>
              }
            </div>

            <div class="field-row field-wide">
              <label for="plannedForTheDay">Planned for the day</label>
              <textarea
                id="plannedForTheDay"
                name="plannedForTheDay"
                rows="3"
                [value]="plannedForTheDay()"
                (input)="onPlannedForTheDayChange($any($event.target).value)"
              ></textarea>
            </div>

            <div class="field-row field-wide">
              <label for="issuesAndBlockers">Issues & Blockers</label>
              <textarea
                id="issuesAndBlockers"
                name="issuesAndBlockers"
                rows="3"
                [value]="issuesAndBlockers()"
                (input)="onIssuesAndBlockersChange($any($event.target).value)"
              ></textarea>
            </div>

            <div class="field-row field-wide">
              <label for="catchbackPlan">Catchback Plan</label>
              <textarea
                id="catchbackPlan"
                name="catchbackPlan"
                rows="3"
                [value]="catchbackPlan()"
                (input)="onCatchbackPlanChange($any($event.target).value)"
              ></textarea>
            </div>
          </div>

          <div class="entry-actions">
            <button
              type="button"
              class="action-btn"
              [disabled]="!canSaveEntry()"
              (click)="saveEntry()"
            >
              {{ isSavingEntry() ? 'Saving...' : 'Save' }}
            </button>
            @if (saveError()) {
              <p class="field-error">{{ saveError() }}</p>
            }
            @if (saveSuccess()) {
              <p class="field-success">{{ saveSuccess() }}</p>
            }
          </div>
        </section>
      }
    </section>
  `,
  styles: `
    .dor-panel {
      max-width: 96rem;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d8e1ee;
      border-radius: 0.75rem;
      padding: 1.25rem;
      box-shadow: 0 8px 20px rgba(24, 59, 98, 0.08);
    }

    h2 {
      margin: 0;
      font-size: 1.35rem;
    }

    .field-row {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      max-width: 16rem;
      margin-top: 0.85rem;
    }

    .action-row {
      margin-top: 1rem;
      display: flex;
      gap: 0.65rem;
      flex-wrap: wrap;
    }

    .action-btn {
      border: 1px solid #1f4d85;
      border-radius: 0.5rem;
      background: #1f4d85;
      color: #ffffff;
      font: inherit;
      font-weight: 600;
      padding: 0.45rem 0.9rem;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }

    .action-btn:hover {
      background: #173a64;
      border-color: #173a64;
    }

    .action-btn:focus {
      outline: 2px solid #8cb5e7;
      outline-offset: 1px;
    }

    label {
      color: #24384f;
      font-weight: 600;
      font-size: 0.95rem;
    }

    input,
    select,
    textarea {
      border: 1px solid #c5d3e5;
      border-radius: 0.5rem;
      font: inherit;
      color: #24384f;
      background: #ffffff;
    }

    input,
    select {
      padding: 0.45rem 0.6rem;
    }

    textarea {
      padding: 0.55rem 0.65rem;
      resize: vertical;
    }

    input:focus,
    select:focus,
    textarea:focus {
      outline: 2px solid #8cb5e7;
      outline-offset: 1px;
      border-color: #1f4d85;
    }

    .field-error {
      margin: 0.15rem 0 0;
      color: #9c1e1e;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .field-success {
      margin: 0.15rem 0 0;
      color: #1a6f32;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .entry-panel {
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid #d8e1ee;
    }

    h3 {
      margin: 0 0 0.8rem;
      color: #24384f;
      font-size: 1.05rem;
    }

    .entry-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 0.85rem 1rem;
    }

    .field-wide {
      grid-column: 1 / -1;
      max-width: none;
    }

    .entry-actions {
      margin-top: 1rem;
      display: flex;
      align-items: center;
      gap: 0.9rem;
      flex-wrap: wrap;
    }

    .view-status {
      margin-top: 0.9rem;
    }

    .view-message {
      color: #42586f;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .view-panel {
      margin-top: 1rem;
    }

    .view-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid #d8e1ee;
      border-radius: 0.5rem;
      background: #ffffff;
    }

    .dor-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 56rem;
    }

    .dor-table th,
    .dor-table td {
      border-bottom: 1px solid #e6edf6;
      padding: 0.55rem 0.65rem;
      text-align: left;
      vertical-align: top;
      font-size: 0.86rem;
      color: #24384f;
    }

    .dor-table th {
      background: #f6f9fd;
      font-weight: 700;
      white-space: nowrap;
    }

    .dor-table tbody tr:last-child td {
      border-bottom: none;
    }

    .row-actions {
      display: flex;
      gap: 0.45rem;
      white-space: nowrap;
    }

    .small-btn {
      border: 1px solid #c4d5ea;
      background: #ffffff;
      color: #1a3f70;
      border-radius: 0.4rem;
      padding: 0.35rem 0.55rem;
      font-size: 0.82rem;
      cursor: pointer;
    }

    .small-btn.danger {
      border-color: #b93f3f;
      color: #b93f3f;
    }
  `
})
export class DailyOperatingReviewComponent {
  protected readonly showAddEntry = signal(false);
  protected readonly assignedResources = signal<string[]>([]);
  protected readonly isLoadingAssignedResources = signal(false);
  protected readonly assignedResourceError = signal('');
  protected readonly selectedAssignedResource = signal('');
  protected readonly projectNames = signal<string[]>([]);
  protected readonly selectedProjectName = signal('');
  protected readonly isLoadingProjectNames = signal(false);
  protected readonly projectNameError = signal('');
  protected readonly workOrders = signal<string[]>([]);
  protected readonly selectedWorkOrderNumber = signal('');
  protected readonly isLoadingWorkOrders = signal(false);
  protected readonly workOrderError = signal('');
  protected readonly reportingDate = signal('');
  protected readonly plannedForTheDay = signal('');
  protected readonly issuesAndBlockers = signal('');
  protected readonly catchbackPlan = signal('');
  protected readonly isSavingEntry = signal(false);
  protected readonly saveError = signal('');
  protected readonly saveSuccess = signal('');
  protected readonly isLoadingView = signal(false);
  protected readonly viewError = signal('');
  protected readonly viewMessage = signal('');
  protected readonly viewRows = signal<DailyOpReviewViewRow[]>([]);
  protected readonly isUpdateMode = signal(false);
  protected readonly isSavingUpdateId = signal<number | null>(null);
  protected readonly isDeletingRowId = signal<number | null>(null);
  private assignedResourcesLoaded = false;

  protected openAddEntry(): void {
    this.showAddEntry.set(true);
    this.isUpdateMode.set(false);

    if (!this.assignedResourcesLoaded) {
      void this.loadAssignedResources();
    }
  }

  protected onAssignedResourceChange(resource: string): void {
    const normalizedResource = String(resource || '').trim();
    this.selectedAssignedResource.set(normalizedResource);
    this.selectedProjectName.set('');
    this.projectNames.set([]);
    this.projectNameError.set('');
    this.selectedWorkOrderNumber.set('');
    this.workOrders.set([]);
    this.workOrderError.set('');
    this.saveError.set('');
    this.saveSuccess.set('');

    if (!normalizedResource) {
      return;
    }

    void this.loadProjectNames(normalizedResource);
  }

  protected onProjectNameChange(projectName: string): void {
    const normalizedProjectName = String(projectName || '').trim();
    this.selectedProjectName.set(normalizedProjectName);
    this.selectedWorkOrderNumber.set('');
    this.workOrders.set([]);
    this.workOrderError.set('');
    this.saveError.set('');
    this.saveSuccess.set('');

    if (!this.selectedAssignedResource() || !normalizedProjectName) {
      return;
    }

    void this.loadWorkOrders(this.selectedAssignedResource(), normalizedProjectName);
  }

  protected onWorkOrderChange(workOrderNumber: string): void {
    this.selectedWorkOrderNumber.set(String(workOrderNumber || '').trim());
    this.saveError.set('');
    this.saveSuccess.set('');
  }

  protected onReportingDateChange(value: string): void {
    this.reportingDate.set(String(value || '').trim());
    this.saveError.set('');
    this.saveSuccess.set('');
    this.viewError.set('');
  }

  protected onPlannedForTheDayChange(value: string): void {
    this.plannedForTheDay.set(String(value || ''));
  }

  protected onIssuesAndBlockersChange(value: string): void {
    this.issuesAndBlockers.set(String(value || ''));
  }

  protected onCatchbackPlanChange(value: string): void {
    this.catchbackPlan.set(String(value || ''));
  }

  protected canSaveEntry(): boolean {
    return (
      !this.isSavingEntry() &&
      !!this.reportingDate() &&
      !!this.selectedAssignedResource() &&
      !!this.selectedProjectName() &&
      !!this.selectedWorkOrderNumber()
    );
  }

  protected async saveEntry(): Promise<void> {
    if (!this.canSaveEntry()) {
      this.saveError.set('Complete all required fields before saving.');
      return;
    }

    this.saveError.set('');
    this.saveSuccess.set('');
    this.isSavingEntry.set(true);

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/daily-operating-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthorizationHeader(),
        },
        body: JSON.stringify({
          reportingDate: this.reportingDate(),
          assignedResource: this.selectedAssignedResource(),
          projectName: this.selectedProjectName(),
          workOrderNumber: this.selectedWorkOrderNumber(),
          plannedForTheDay: this.plannedForTheDay(),
          issuesAndBlockers: this.issuesAndBlockers(),
          catchbackPlan: this.catchbackPlan(),
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        details?: string;
      };

      if (!response.ok) {
        this.saveError.set(body.message || body.details || 'Unable to save Daily Operating Review entry.');
        return;
      }

      this.saveSuccess.set('Daily Operating Review entry saved.');
    } catch {
      this.saveError.set('Unable to save Daily Operating Review entry.');
    } finally {
      this.isSavingEntry.set(false);
    }
  }

  protected async viewEntriesByReportingDate(): Promise<void> {
    this.isUpdateMode.set(false);
    await this.loadEntriesByReportingDate();
  }

  protected async openUpdateEntriesByReportingDate(): Promise<void> {
    this.isUpdateMode.set(true);
    this.showAddEntry.set(false);
    await this.loadEntriesByReportingDate();
  }

  protected onUpdateField(
    rowId: number,
    field: keyof Omit<DailyOpReviewViewRow, 'id'>,
    value: string
  ): void {
    this.viewRows.update((rows) =>
      rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  }

  protected async saveUpdatedRow(row: DailyOpReviewViewRow): Promise<void> {
    this.viewError.set('');
    this.viewMessage.set('');

    if (
      !row.reportingDate.trim() ||
      !row.assignedResource.trim() ||
      !row.projectName.trim() ||
      !row.workOrderNumber.trim()
    ) {
      this.viewError.set('Reporting Date, Assigned Resource, Project Name, and Work Order# are required.');
      return;
    }

    this.isSavingUpdateId.set(row.id);

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/daily-operating-review/${row.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthorizationHeader(),
        },
        body: JSON.stringify({
          reportingDate: row.reportingDate.trim(),
          assignedResource: row.assignedResource.trim(),
          projectName: row.projectName.trim(),
          workOrderNumber: row.workOrderNumber.trim(),
          plannedForTheDay: row.plannedForTheDay,
          issuesAndBlockers: row.issuesAndBlockers,
          catchbackPlan: row.catchbackPlan,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        details?: string;
      };

      if (!response.ok) {
        this.viewError.set(body.message || body.details || 'Unable to update report entry.');
        return;
      }

      this.viewMessage.set('Report entry updated.');
    } catch {
      this.viewError.set('Unable to update report entry.');
    } finally {
      this.isSavingUpdateId.set(null);
    }
  }

  protected async deleteRow(rowId: number): Promise<void> {
    this.viewError.set('');
    this.viewMessage.set('');
    this.isDeletingRowId.set(rowId);

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/daily-operating-review/${rowId}`, {
        method: 'DELETE',
        headers: { ...this.getAuthorizationHeader() },
      });

      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        details?: string;
      };

      if (!response.ok) {
        this.viewError.set(body.message || body.details || 'Unable to delete report entry.');
        return;
      }

      this.viewRows.update((rows) => rows.filter((row) => row.id !== rowId));
      this.viewMessage.set('Report entry deleted.');
    } catch {
      this.viewError.set('Unable to delete report entry.');
    } finally {
      this.isDeletingRowId.set(null);
    }
  }

  protected exportViewToExcel(): void {
    const rows = this.viewRows();
    if (rows.length === 0) {
      this.viewMessage.set('No rows available to export.');
      return;
    }

    const headers = [
      'Reporting Date',
      'Assigned Resource',
      'Project Name',
      'Work Order#',
      'Planned for the day',
      'Issues & Blockers',
      'Catchback Plan',
    ];

    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        [
          row.reportingDate,
          row.assignedResource,
          row.projectName,
          row.workOrderNumber,
          row.plannedForTheDay,
          row.issuesAndBlockers,
          row.catchbackPlan,
        ]
          .map((value) => this.escapeCsvValue(value))
          .join(',')
      ),
    ];

    const csvContent = `\uFEFF${csvLines.join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const datePart = this.reportingDate() || 'all-dates';

    link.href = url;
    link.download = `daily-operating-review-${datePart}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private async loadEntriesByReportingDate(): Promise<void> {
    const reportDate = this.reportingDate().trim();
    this.viewError.set('');
    this.viewMessage.set('');
    this.viewRows.set([]);

    if (!reportDate) {
      this.viewMessage.set(`No Reports exist for the report date, ${reportDate}`);
      return;
    }

    this.isLoadingView.set(true);

    try {
      const query = encodeURIComponent(reportDate);
      const response = await fetch(`${this.getApiBaseUrl()}/api/daily-operating-review?reportingDate=${query}`);
      const body = (await response.json().catch(() => ({}))) as {
        reports?: DailyOpReviewViewRow[];
        message?: string;
        details?: string;
      };

      if (!response.ok) {
        this.viewError.set(body.message || body.details || 'Unable to load reports.');
        return;
      }

      const rows = Array.isArray(body.reports) ? body.reports : [];
      this.viewRows.set(rows);

      if (rows.length === 0) {
        this.viewMessage.set(`No Reports exist for the report date, ${reportDate}`);
      }
    } catch {
      this.viewError.set('Unable to load reports.');
    } finally {
      this.isLoadingView.set(false);
    }
  }

  private async loadAssignedResources(): Promise<void> {
    this.assignedResourceError.set('');
    this.isLoadingAssignedResources.set(true);

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/assigned-resources`);
      const body = (await response.json().catch(() => ({}))) as {
        resources?: string[];
        message?: string;
        details?: string;
      };

      if (!response.ok) {
        this.assignedResources.set([]);
        this.assignedResourceError.set(
          body.message || body.details || 'Unable to load assigned resources.'
        );
        return;
      }

      const resources = Array.isArray(body.resources)
        ? body.resources.filter((item) => typeof item === 'string' && item.trim() !== '')
        : [];

      this.assignedResources.set(resources);
      this.assignedResourcesLoaded = true;
    } catch {
      this.assignedResources.set([]);
      this.assignedResourceError.set('Unable to load assigned resources.');
    } finally {
      this.isLoadingAssignedResources.set(false);
    }
  }

  private async loadProjectNames(resourceAssigned: string): Promise<void> {
    this.projectNameError.set('');
    this.isLoadingProjectNames.set(true);

    try {
      const query = encodeURIComponent(resourceAssigned);
      const response = await fetch(`${this.getApiBaseUrl()}/api/project-orders?resourceAssigned=${query}`);
      const body = (await response.json().catch(() => ({}))) as {
        projectNames?: string[];
        message?: string;
        details?: string;
      };

      if (!response.ok) {
        this.projectNames.set([]);
        this.projectNameError.set(
          body.message || body.details || 'Unable to load project names.'
        );
        return;
      }

      const projectNames = Array.isArray(body.projectNames)
        ? body.projectNames.filter((item) => typeof item === 'string' && item.trim() !== '')
        : [];

      this.projectNames.set(projectNames);
    } catch {
      this.projectNames.set([]);
      this.projectNameError.set('Unable to load project names.');
    } finally {
      this.isLoadingProjectNames.set(false);
    }
  }

  private async loadWorkOrders(resourceAssigned: string, projectName: string): Promise<void> {
    this.workOrderError.set('');
    this.isLoadingWorkOrders.set(true);

    try {
      const resourceQuery = encodeURIComponent(resourceAssigned);
      const projectQuery = encodeURIComponent(projectName);
      const response = await fetch(
        `${this.getApiBaseUrl()}/api/project-work-orders?resourceAssigned=${resourceQuery}&projectName=${projectQuery}`
      );
      const body = (await response.json().catch(() => ({}))) as {
        workOrders?: string[];
        message?: string;
        details?: string;
      };

      if (!response.ok) {
        this.workOrders.set([]);
        this.workOrderError.set(body.message || body.details || 'Unable to load work orders.');
        return;
      }

      const workOrders = Array.isArray(body.workOrders)
        ? body.workOrders.filter((item) => typeof item === 'string' && item.trim() !== '')
        : [];

      this.workOrders.set(workOrders);
    } catch {
      this.workOrders.set([]);
      this.workOrderError.set('Unable to load work orders.');
    } finally {
      this.isLoadingWorkOrders.set(false);
    }
  }

  private getApiBaseUrl(): string {
    return resolveApiBaseUrl();
  }

  private getAuthorizationHeader(): Record<string, string> {
    const token = localStorage.getItem('irp_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private escapeCsvValue(value: string): string {
    const normalized = String(value ?? '');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
