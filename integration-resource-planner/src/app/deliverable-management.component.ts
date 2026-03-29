import { Component, signal } from '@angular/core';
import { resolveApiBaseUrl } from './api-base-url';

type Deliverable = {
  id: number;
  projectName: string;
  deliverableName: string;
  linkToDeliverable: string;
  deliverableType: 'Estimate' | 'Technical Design' | 'MuleSoft Exchange Entry' | 'Solution Blue Print' | 'ARB Approval' | 'CRQ' | 'Other';
  resourceAssigned: string;
  workOrderNumber: string;
  status: 'Not Started' | 'In Progress' | 'Complete';
};

type DeliverableDraft = Omit<Deliverable, 'id'>;

@Component({
  selector: 'app-deliverable-management',
  standalone: true,
  template: `
    <section class="deliverable-panel">
      <div class="title-row">
        <h2>Deliverable Management</h2>
        <a
          class="templates-link"
          href="https://wiki.comp.pge.com/display/EIPUB/Best+Practices+-+Project+Deliverables"
          target="_blank"
          rel="noopener noreferrer"
        >
          Deliverable templates and samples
        </a>
      </div>

      <div class="actions" role="group" aria-label="Deliverable management actions">
        <button type="button" (click)="setMode('add')" [class.active]="mode() === 'add'">
          Add Deliverables to Existing Project
        </button>
        <button type="button" (click)="setMode('view')" [class.active]="mode() === 'view'">
          View All Deliverables
        </button>
        <button
          type="button"
          (click)="enableEditMode()"
          [class.active]="mode() === 'view' && editModeEnabled()"
        >
          Edit Deliverables Log
        </button>
      </div>

      @if (mode() === 'add') {
        <label class="top-field">
          Resource Assigned
          <select #resourceAssigned required (change)="onResourceAssignedChange(resourceAssigned, projectName, workOrderNumber)">
            <option value="">Select a resource</option>
            @for (resource of assignedResources(); track resource) {
              <option [value]="resource">{{ resource }}</option>
            }
          </select>
        </label>

        <form
          class="deliverable-form"
          (submit)="submitDeliverable($event, projectName, deliverableName, linkToDeliverable, deliverableType, resourceAssigned, workOrderNumber, status)"
        >
          <label>
            Project Name
            <select #projectName required (change)="onProjectNameChange(resourceAssigned, projectName, workOrderNumber)">
              <option value="">Select a project</option>
              @for (project of projectNames(); track project) {
                <option [value]="project">{{ project }}</option>
              }
            </select>
          </label>

          <label>
            Work Order#
            <select #workOrderNumber required>
              <option value="">Select a work order</option>
              @for (workOrder of workOrders(); track workOrder) {
                <option [value]="workOrder">{{ workOrder }}</option>
              }
            </select>
          </label>

          <label>
            Deliverable Name
            <input #deliverableName type="text" required />
          </label>

          <label>
            Link to Deliverable
            <input #linkToDeliverable type="url" required />
          </label>

          <label>
            Deliverable Type
            <select #deliverableType required>
              <option value="Estimate">Estimated Hours</option>
              <option value="Technical Design">Technical Design</option>
              <option value="MuleSoft Exchange Entry">MuleSoft Exchange Entry</option>
              <option value="Solution Blue Print">Solution Blue Print</option>
              <option value="ARB Approval">ARB Approval</option>
              <option value="CRQ">CRQ</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label>
            Status
            <select #status required>
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Complete">Complete</option>
            </select>
          </label>

          <button type="submit" class="submit-btn" [disabled]="isSaving()">
            {{ isSaving() ? 'Saving...' : 'Save Deliverable' }}
          </button>

          @if (formError()) {
            <p class="error-message">{{ formError() }}</p>
          }
        </form>
      }

      @if (mode() === 'view') {
        @if (isLoadingDeliverables()) {
          <p class="empty-state">Loading deliverables...</p>
        } @else if (viewError()) {
          <p class="error-message">{{ viewError() }}</p>
        } @else if (deliverables().length === 0) {
          <p class="empty-state">No deliverables have been added yet.</p>
        } @else {
          @if (!editModeEnabled()) {
            <p class="empty-state">Click "Edit Deliverables Log" to enable table field editing.</p>
          }

          <div class="table-wrap">
            <table class="deliverable-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Deliverable</th>
                  <th>Link to Deliverable</th>
                  <th>Deliverable Type</th>
                  <th>Resource Assigned</th>
                  <th>Work Order#</th>
                  <th>Status</th>
                  @if (editModeEnabled()) {
                    <th>Actions</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (deliverable of deliverables(); track deliverable.id) {
                  @if (editModeEnabled() && editingId() === deliverable.id) {
                    <tr>
                      <td><input [value]="editDraft().projectName" (input)="updateDraftField('projectName', $any($event.target).value)" /></td>
                      <td><input [value]="editDraft().deliverableName" (input)="updateDraftField('deliverableName', $any($event.target).value)" /></td>
                      <td><input [value]="editDraft().linkToDeliverable" (input)="updateDraftField('linkToDeliverable', $any($event.target).value)" /></td>
                      <td>
                        <select [value]="editDraft().deliverableType" (change)="updateDraftField('deliverableType', $any($event.target).value)">
                          <option value="Estimate">Estimated Hours</option>
                          <option value="Technical Design">Technical Design</option>
                          <option value="MuleSoft Exchange Entry">MuleSoft Exchange Entry</option>
                          <option value="Solution Blue Print">Solution Blue Print</option>
                          <option value="ARB Approval">ARB Approval</option>
                          <option value="CRQ">CRQ</option>
                          <option value="Other">Other</option>
                        </select>
                      </td>
                      <td><input [value]="editDraft().resourceAssigned" (input)="updateDraftField('resourceAssigned', $any($event.target).value)" /></td>
                      <td><input [value]="editDraft().workOrderNumber" (input)="updateDraftField('workOrderNumber', $any($event.target).value)" /></td>
                      <td>
                        <select [value]="editDraft().status" (change)="updateDraftField('status', $any($event.target).value)">
                          <option value="Not Started">Not Started</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Complete">Complete</option>
                        </select>
                      </td>
                      @if (editModeEnabled()) {
                        <td class="row-actions">
                          <button type="button" class="small-btn" (click)="saveEdit(deliverable.id)">Save</button>
                          <button type="button" class="small-btn secondary" (click)="cancelEdit()">Cancel</button>
                        </td>
                      }
                    </tr>
                  } @else {
                    <tr>
                      <td>{{ deliverable.projectName }}</td>
                      <td>{{ deliverable.deliverableName }}</td>
                      <td><a [href]="deliverable.linkToDeliverable" target="_blank" rel="noopener noreferrer">Open</a></td>
                      <td>{{ deliverable.deliverableType === 'Estimate' ? 'Estimated Hours' : deliverable.deliverableType }}</td>
                      <td>{{ deliverable.resourceAssigned }}</td>
                      <td>{{ deliverable.workOrderNumber }}</td>
                      <td>{{ deliverable.status }}</td>
                      @if (editModeEnabled()) {
                        <td class="row-actions">
                          <button type="button" class="small-btn" (click)="startEdit(deliverable)">Edit</button>
                          <button type="button" class="small-btn danger" (click)="deleteDeliverable(deliverable.id)">Delete</button>
                        </td>
                      }
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>

          @if (tableActionError()) {
            <p class="error-message">{{ tableActionError() }}</p>
          }
        }
      }
    </section>
  `,
  styles: `
    .deliverable-panel {
      max-width: 96rem;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d8e1ee;
      border-radius: 0.75rem;
      padding: 1.25rem;
      box-shadow: 0 8px 20px rgba(24, 59, 98, 0.08);
    }

    h2 {
      margin: 0 0 1rem;
      font-size: 1.35rem;
    }

    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .title-row h2 {
      margin: 0;
    }

    .templates-link {
      color: #1f4d85;
      font-weight: 600;
      text-decoration: underline;
    }

    .templates-link:hover {
      color: #163a65;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .actions button,
    .submit-btn {
      border: 1px solid #c4d5ea;
      background: #ffffff;
      color: #1a3f70;
      border-radius: 0.5rem;
      padding: 0.55rem 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }

    .actions button.active,
    .submit-btn {
      background: #1f4d85;
      border-color: #1f4d85;
      color: #ffffff;
    }

    .deliverable-form {
      display: grid;
      gap: 0.75rem;
      margin-top: 0.75rem;
    }

    .top-field {
      display: grid;
      gap: 0.35rem;
      font-weight: 600;
      color: #334b68;
    }

    label {
      display: grid;
      gap: 0.35rem;
      font-weight: 600;
      color: #334b68;
    }

    input,
    select {
      border: 1px solid #c4d5ea;
      border-radius: 0.45rem;
      padding: 0.5rem 0.6rem;
      font-size: 0.95rem;
      background: #ffffff;
    }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid #d8e1ee;
      border-radius: 0.5rem;
    }

    .deliverable-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1100px;
    }

    .deliverable-table th,
    .deliverable-table td {
      border-bottom: 1px solid #e6edf5;
      padding: 0.55rem 0.65rem;
      text-align: left;
      color: #334b68;
      font-size: 0.9rem;
      white-space: nowrap;
    }

    .deliverable-table th {
      background: #f4f8fc;
      font-weight: 700;
      color: #1a3f70;
    }

    .empty-state {
      margin: 0;
      color: #42586f;
    }

    .row-actions {
      display: flex;
      gap: 0.4rem;
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

    .small-btn.secondary {
      border-color: #909fb3;
      color: #485a73;
    }

    .error-message {
      margin: 0;
      color: #9c1e1e;
      font-weight: 600;
    }
  `
})
export class DeliverableManagementComponent {
  protected readonly mode = signal<'add' | 'view'>('add');
  protected readonly projectNames = signal<string[]>([]);
  protected readonly workOrders = signal<string[]>([]);
  protected readonly assignedResources = signal<string[]>([]);
  protected readonly deliverables = signal<Deliverable[]>([]);
  protected readonly isSaving = signal(false);
  protected readonly isLoadingDeliverables = signal(false);
  protected readonly formError = signal('');
  protected readonly viewError = signal('');
  protected readonly tableActionError = signal('');
  protected readonly editingId = signal<number | null>(null);
  protected readonly editModeEnabled = signal(false);
  protected readonly editDraft = signal<DeliverableDraft>({
    projectName: '',
    deliverableName: '',
    linkToDeliverable: '',
    deliverableType: 'Estimate',
    resourceAssigned: '',
    workOrderNumber: '',
    status: 'Not Started'
  });

  constructor() {
    void this.loadAssignedResources();
  }

  protected setMode(mode: 'add' | 'view'): void {
    this.mode.set(mode);
    this.formError.set('');
    this.tableActionError.set('');

    if (mode === 'add') {
      this.editModeEnabled.set(false);
      this.editingId.set(null);
      this.projectNames.set([]);
      this.workOrders.set([]);
      void this.loadAssignedResources();
      return;
    }

    void this.loadDeliverables();
  }

  protected enableEditMode(): void {
    this.mode.set('view');
    this.editModeEnabled.set(true);
    this.tableActionError.set('');
    void this.loadDeliverables();
  }

  protected async submitDeliverable(
    event: Event,
    projectNameInput: HTMLSelectElement,
    deliverableNameInput: HTMLInputElement,
    linkToDeliverableInput: HTMLInputElement,
    deliverableTypeInput: HTMLSelectElement,
    resourceAssignedInput: HTMLSelectElement,
    workOrderNumberInput: HTMLSelectElement,
    statusInput: HTMLSelectElement
  ): Promise<void> {
    event.preventDefault();

    if (this.isSaving()) {
      return;
    }

    this.formError.set('');

    const payload: DeliverableDraft = {
      projectName: projectNameInput.value.trim(),
      deliverableName: deliverableNameInput.value.trim(),
      linkToDeliverable: linkToDeliverableInput.value.trim(),
      deliverableType: this.normalizeDeliverableType(deliverableTypeInput.value),
      resourceAssigned: resourceAssignedInput.value.trim(),
      workOrderNumber: workOrderNumberInput.value.trim(),
      status: this.normalizeStatus(statusInput.value)
    };

    if (!payload.projectName || !payload.deliverableName || !payload.linkToDeliverable || !payload.deliverableType || !payload.resourceAssigned || !payload.workOrderNumber) {
      this.formError.set('Please fill all required fields before saving.');
      return;
    }

    this.isSaving.set(true);

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/deliverables`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthorizationHeader()
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.formError.set(errorBody.message || 'Unable to save deliverable.');
        return;
      }

      projectNameInput.value = '';
      deliverableNameInput.value = '';
      linkToDeliverableInput.value = '';
      deliverableTypeInput.value = 'Estimate';
      resourceAssignedInput.value = '';
      workOrderNumberInput.value = '';
      statusInput.value = 'Not Started';
      this.setMode('view');
    } catch {
      this.formError.set('Unable to save deliverable.');
    } finally {
      this.isSaving.set(false);
    }
  }

  protected onResourceAssignedChange(
    resourceAssignedInput: HTMLSelectElement,
    projectNameInput: HTMLSelectElement,
    workOrderNumberInput: HTMLSelectElement
  ): void {
    projectNameInput.value = '';
    workOrderNumberInput.value = '';
    this.workOrders.set([]);
    void this.loadProjectNames(resourceAssignedInput.value.trim());
    this.formError.set('');
  }

  protected onProjectNameChange(
    resourceAssignedInput: HTMLSelectElement,
    projectNameInput: HTMLSelectElement,
    workOrderNumberInput: HTMLSelectElement
  ): void {
    workOrderNumberInput.value = '';
    void this.loadWorkOrders(resourceAssignedInput.value.trim(), projectNameInput.value.trim());
    this.formError.set('');
  }

  private async loadProjectNames(resourceAssigned: string): Promise<void> {
    if (!resourceAssigned) {
      this.projectNames.set([]);
      return;
    }

    try {
      const params = new URLSearchParams({ resourceAssigned });
      const response = await fetch(`${this.getApiBaseUrl()}/api/project-orders?${params.toString()}`);

      if (!response.ok) {
        this.projectNames.set([]);
        return;
      }

      const result = (await response.json()) as { projectNames?: string[] };
      this.projectNames.set(result.projectNames ?? []);
    } catch {
      this.projectNames.set([]);
    }
  }

  private async loadWorkOrders(resourceAssigned: string, projectName: string): Promise<void> {
    if (!resourceAssigned || !projectName) {
      this.workOrders.set([]);
      return;
    }

    try {
      const params = new URLSearchParams({ resourceAssigned, projectName });
      const response = await fetch(
        `${this.getApiBaseUrl()}/api/project-work-orders?${params.toString()}`
      );

      if (!response.ok) {
        this.workOrders.set([]);
        return;
      }

      const result = (await response.json()) as { workOrders?: string[] };
      this.workOrders.set(result.workOrders ?? []);
    } catch {
      this.workOrders.set([]);
    }
  }

  private async loadAssignedResources(): Promise<void> {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/assigned-resources`);
      if (!response.ok) {
        this.assignedResources.set([]);
        return;
      }

      const result = (await response.json()) as { resources?: string[] };
      this.assignedResources.set(result.resources ?? []);
    } catch {
      this.assignedResources.set([]);
    }
  }

  private async loadDeliverables(): Promise<void> {
    this.isLoadingDeliverables.set(true);
    this.viewError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/deliverables`);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.viewError.set(errorBody.message || 'Unable to load deliverables.');
        this.deliverables.set([]);
        return;
      }

      const result = (await response.json()) as { deliverables?: Deliverable[] };
      this.deliverables.set(result.deliverables ?? []);
    } catch {
      this.viewError.set('Unable to load deliverables.');
      this.deliverables.set([]);
    } finally {
      this.isLoadingDeliverables.set(false);
    }
  }

  protected startEdit(deliverable: Deliverable): void {
    this.editingId.set(deliverable.id);
    this.tableActionError.set('');
    this.editDraft.set({
      projectName: deliverable.projectName,
      deliverableName: deliverable.deliverableName,
      linkToDeliverable: deliverable.linkToDeliverable,
      deliverableType: deliverable.deliverableType,
      resourceAssigned: deliverable.resourceAssigned,
      workOrderNumber: deliverable.workOrderNumber,
      status: deliverable.status
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.tableActionError.set('');
  }

  protected updateDraftField<K extends keyof DeliverableDraft>(
    field: K,
    value: DeliverableDraft[K]
  ): void {
    this.editDraft.update((current) => ({
      ...current,
      [field]: value
    }));
  }

  protected async saveEdit(deliverableId: number): Promise<void> {
    const draft = this.editDraft();

    if (
      !draft.projectName.trim() ||
      !draft.deliverableName.trim() ||
      !draft.linkToDeliverable.trim() ||
      !draft.deliverableType ||
      !draft.resourceAssigned.trim() ||
      !draft.workOrderNumber.trim() ||
      !draft.status
    ) {
      this.tableActionError.set('All fields are required before saving edits.');
      return;
    }

    this.tableActionError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/deliverables/${deliverableId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...this.getAuthorizationHeader() },
        body: JSON.stringify({
          projectName: draft.projectName.trim(),
          deliverableName: draft.deliverableName.trim(),
          linkToDeliverable: draft.linkToDeliverable.trim(),
          deliverableType: this.normalizeDeliverableType(draft.deliverableType),
          resourceAssigned: draft.resourceAssigned.trim(),
          workOrderNumber: draft.workOrderNumber.trim(),
          status: this.normalizeStatus(draft.status)
        })
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.tableActionError.set(errorBody.message || 'Unable to update deliverable.');
        return;
      }

      this.editingId.set(null);
      await this.loadDeliverables();
    } catch {
      this.tableActionError.set('Unable to update deliverable.');
    }
  }

  protected async deleteDeliverable(deliverableId: number): Promise<void> {
    const confirmed = globalThis.confirm('Delete this deliverable? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    this.tableActionError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/deliverables/${deliverableId}`, {
        method: 'DELETE',
        headers: { ...this.getAuthorizationHeader() }
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.tableActionError.set(errorBody.message || 'Unable to delete deliverable.');
        return;
      }

      if (this.editingId() === deliverableId) {
        this.editingId.set(null);
      }

      await this.loadDeliverables();
    } catch {
      this.tableActionError.set('Unable to delete deliverable.');
    }
  }

  private normalizeStatus(status: string): Deliverable['status'] {
    if (status === 'In Progress' || status === 'Complete') {
      return status;
    }

    return 'Not Started';
  }

  private normalizeDeliverableType(type: string): Deliverable['deliverableType'] {
    const allowedTypes: Deliverable['deliverableType'][] = [
      'Estimate',
      'Technical Design',
      'MuleSoft Exchange Entry',
      'Solution Blue Print',
      'ARB Approval',
      'CRQ',
      'Other'
    ];

    if (allowedTypes.includes(type as Deliverable['deliverableType'])) {
      return type as Deliverable['deliverableType'];
    }

    return 'Estimate';
  }

  private getApiBaseUrl(): string {
    return resolveApiBaseUrl();
  }

  private getAuthorizationHeader(): Record<string, string> {
    const token = localStorage.getItem('irp_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
