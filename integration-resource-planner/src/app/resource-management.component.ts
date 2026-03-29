import { Component, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { resolveApiBaseUrl } from './api-base-url';

type AssignmentStatus = 'In-Progress' | 'Backfill Needed' | 'Complete' | 'Closed';

type Assignment = {
  id: number;
  workOrderNumber: string;
  projectName: string;
  projectLead: string;
  resourceAssigned: string;
  projectStartDate: string;
  projectEndDate: string;
  estimate?: string;
  projectOrderNumber: string;
  status: AssignmentStatus;
};

type AssignmentDraft = Omit<Assignment, 'id'>;

type IntakeLogEntry = {
  ticketId: string;
  customer: string;
  technology: string;
  requestType: string;
  orderNumber: string;
  requestTitle: string;
  scheduledStartDate: string;
  scheduledEndDate: string;
  highLevelDescription: string;
};

@Component({
  selector: 'app-resource-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="resource-panel">
      <div class="panel-header">
        <h2>Resource Management</h2>
        <button type="button" class="intake-log-btn" (click)="openIntakeLogPopup()">Check Intake Log</button>
      </div>

      <div class="actions" role="group" aria-label="Resource management actions">
        <button type="button" (click)="setMode('add')" [class.active]="mode() === 'add'">
          Add New Resource Assignment
        </button>
        <button type="button" (click)="setMode('view')" [class.active]="mode() === 'view' && !editModeEnabled()">
          View All Existing Resource Assignments
        </button>
        <button
          type="button"
          (click)="enableEditMode()"
          [class.active]="mode() === 'view' && editModeEnabled()"
        >
          Edit Resource Assignments
        </button>
      </div>

      @if (mode() === 'add') {
        <form
          class="assignment-form"
          (submit)="submitAssignment($event)"
        >
          <label>
            Work Order#
            <input
              type="text"
              required
              [value]="addDraft().workOrderNumber"
              (input)="updateAddDraftField('workOrderNumber', $any($event.target).value)"
            />
          </label>

          <label>
            Project Name
            <input
              type="text"
              required
              [value]="addDraft().projectName"
              (input)="updateAddDraftField('projectName', $any($event.target).value)"
            />
          </label>

          <label>
            Project Lead
            <input
              type="text"
              required
              [value]="addDraft().projectLead"
              (input)="updateAddDraftField('projectLead', $any($event.target).value)"
            />
          </label>

          <label>
            Resource Assigned
            <input
              type="text"
              list="available-users-add"
              required
              [value]="addDraft().resourceAssigned"
              (input)="updateAddDraftField('resourceAssigned', $any($event.target).value)"
              placeholder="Type to search users..."
            />
            <datalist id="available-users-add">
              @for (user of filteredAddResourceUsers(); track user.lanId) {
                <option [value]="user.name" [label]="user.lanId"></option>
              }
            </datalist>
          </label>

          <label>
            Project Start Date
            <input
              type="date"
              required
              [value]="addDraft().projectStartDate"
              (input)="updateAddDraftField('projectStartDate', $any($event.target).value)"
            />
          </label>

          <label>
            Project End Date
            <input
              type="date"
              required
              [value]="addDraft().projectEndDate"
              (input)="updateAddDraftField('projectEndDate', $any($event.target).value)"
            />
          </label>

          <label>
            Estimated Hours (optional)
            <input
              type="text"
              class="estimate-input"
              [value]="addDraft().estimate || ''"
              (input)="updateAddDraftField('estimate', $any($event.target).value)"
            />
          </label>

          <label>
            Project Order Number
            <input
              type="text"
              required
              [value]="addDraft().projectOrderNumber"
              (input)="updateAddDraftField('projectOrderNumber', $any($event.target).value)"
            />
          </label>

          <label>
            Status
            <select
              required
              [value]="addDraft().status"
              (change)="updateAddDraftField('status', $any($event.target).value)"
            >
              <option value="In-Progress">In-Progress</option>
              <option value="Backfill Needed">Backfill Needed</option>
              <option value="Complete">Complete</option>
              <option value="Closed">Closed</option>
            </select>
          </label>

          <button type="submit" class="submit-btn" [disabled]="isSaving()">
            {{ isSaving() ? 'Saving...' : 'Save Assignment' }}
          </button>

          @if (saveError()) {
            <p class="error-message">{{ saveError() }}</p>
          }
        </form>
      }

      @if (mode() === 'view') {
        @if (isLoadingAssignments()) {
          <p class="empty-state">Loading resource assignments...</p>
        } @else if (viewError()) {
          <p class="error-message">{{ viewError() }}</p>
        } @else if (assignments().length === 0) {
          <p class="empty-state">No resource assignments have been added yet.</p>
        } @else {
          <div class="view-header-row">
            @if (!editModeEnabled()) {
              <p class="empty-state">Click "Edit Resource Assignments" to enable table field editing.</p>
            }

            <button type="button" class="small-btn" (click)="exportAssignmentsToExcel()">
              Export to Excel
            </button>
          </div>

          <div class="table-wrap">
            <table class="assignment-table">
              <thead>
                <tr>
                  <th>Work Order#</th>
                  <th>Project Name</th>
                  <th>Project Lead</th>
                  <th>Resource Assigned</th>
                  <th>Project Start Date</th>
                  <th>Project End Date</th>
                  <th>Estimated Hours</th>
                  <th>Project Order Number</th>
                  <th>Status</th>
                  @if (editModeEnabled()) {
                    <th>Actions</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (assignment of assignments(); track assignment.id) {
                  @if (editModeEnabled() && editingId() === assignment.id) {
                    <tr>
                      <td><input [value]="editDraft().workOrderNumber" (input)="updateDraftField('workOrderNumber', $any($event.target).value)" /></td>
                      <td><input [value]="editDraft().projectName" (input)="updateDraftField('projectName', $any($event.target).value)" /></td>
                      <td><input [value]="editDraft().projectLead" (input)="updateDraftField('projectLead', $any($event.target).value)" /></td>
                      <td><input list="available-users-edit" [value]="editDraft().resourceAssigned" (input)="updateDraftField('resourceAssigned', $any($event.target).value)" />
                        <datalist id="available-users-edit">
                          @for (user of filteredEditResourceUsers(); track user.lanId) {
                            <option [value]="user.name" [label]="user.lanId"></option>
                          }
                        </datalist>
                      </td>
                      <td><input type="date" [value]="editDraft().projectStartDate" (input)="updateDraftField('projectStartDate', $any($event.target).value)" /></td>
                      <td><input type="date" [value]="editDraft().projectEndDate" (input)="updateDraftField('projectEndDate', $any($event.target).value)" /></td>
                      <td><input class="estimate-input" [value]="editDraft().estimate || ''" (input)="updateDraftField('estimate', $any($event.target).value)" /></td>
                      <td><input [value]="editDraft().projectOrderNumber" (input)="updateDraftField('projectOrderNumber', $any($event.target).value)" /></td>
                      <td>
                        <select [value]="editDraft().status" (change)="updateDraftField('status', $any($event.target).value)">
                          <option value="In-Progress">In-Progress</option>
                          <option value="Backfill Needed">Backfill Needed</option>
                          <option value="Complete">Complete</option>
                          <option value="Closed">Closed</option>
                        </select>
                      </td>
                      @if (editModeEnabled()) {
                        <td class="row-actions">
                          <button type="button" class="small-btn" (click)="saveEdit(assignment.id)">Save</button>
                          <button type="button" class="small-btn secondary" (click)="cancelEdit()">Cancel</button>
                        </td>
                      }
                    </tr>
                  } @else {
                    <tr>
                      <td>{{ assignment.workOrderNumber }}</td>
                      <td>{{ assignment.projectName }}</td>
                      <td>{{ assignment.projectLead }}</td>
                      <td>{{ assignment.resourceAssigned }}</td>
                      <td>{{ assignment.projectStartDate }}</td>
                      <td>{{ assignment.projectEndDate }}</td>
                      <td>{{ assignment.estimate || '-' }}</td>
                      <td>{{ assignment.projectOrderNumber }}</td>
                      <td>{{ assignment.status }}</td>
                      @if (editModeEnabled()) {
                        <td class="row-actions">
                          <button type="button" class="small-btn" (click)="startEdit(assignment)">Edit</button>
                          <button type="button" class="small-btn danger" (click)="deleteAssignment(assignment.id)">Delete</button>
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

      @if (isIntakeLogOpen()) {
        <div class="modal-overlay" (click)="closeIntakeLogPopup()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Intake Log</h3>
              <button type="button" class="small-btn secondary" (click)="closeIntakeLogPopup()">Close</button>
            </div>

            @if (isLoadingIntakeLog()) {
              <p class="empty-state">Loading intake log...</p>
            } @else if (intakeLogError()) {
              <p class="error-message">{{ intakeLogError() }}</p>
            } @else if (intakeLogEntries().length === 0) {
              <p class="empty-state">No intake log records found for Enterprise Integration Development.</p>
            } @else {
              <div class="intake-table-wrap">
                <table class="intake-table">
                  <thead>
                    <tr>
                      <th>Ticket ID</th>
                      <th>Customer</th>
                      <th>Technology</th>
                      <th>Request Type</th>
                      <th>Order Number</th>
                      <th>Request Title</th>
                      <th>Scheduled Start Date</th>
                      <th>Scheduled End Date</th>
                      <th>High Level Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of intakeLogEntries(); track entry.ticketId + '-' + entry.requestTitle) {
                      <tr
                        class="intake-row"
                        [class.selected]="selectedIntakeRowKey() === entry.ticketId + '-' + entry.requestTitle"
                        (click)="highlightIntakeLogEntry(entry)"
                        (dblclick)="selectIntakeLogEntry(entry)"
                      >
                        <td>{{ entry.ticketId }}</td>
                        <td>{{ entry.customer }}</td>
                        <td>{{ entry.technology }}</td>
                        <td>{{ entry.requestType }}</td>
                        <td>{{ entry.orderNumber }}</td>
                        <td>{{ entry.requestTitle }}</td>
                        <td>{{ entry.scheduledStartDate }}</td>
                        <td>{{ entry.scheduledEndDate }}</td>
                        <td class="intake-desc">{{ entry.highLevelDescription }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      }

      @if (showPostSavePrompt()) {
        <div class="modal-overlay" (click)="onPostSavePromptChoice(false)">
          <div class="modal-card confirm-modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Add Another Resource?</h3>
            </div>
            <p class="confirm-text">
              Resource assignment saved. Would you like to add another resource?
            </p>
            <div class="confirm-actions">
              <button type="button" class="small-btn" (click)="onPostSavePromptChoice(true)">Yes</button>
              <button type="button" class="small-btn secondary" (click)="onPostSavePromptChoice(false)">No</button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: `
    .resource-panel {
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

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin: 0 0 1rem;
    }

    .intake-log-btn {
      border: 1px solid #c4d5ea;
      background: #ffffff;
      color: #1a3f70;
      border-radius: 0.5rem;
      padding: 0.45rem 0.85rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(8, 20, 36, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .modal-card {
      width: min(96vw, 90rem);
      max-height: 88vh;
      overflow: auto;
      background: #ffffff;
      border-radius: 0.7rem;
      border: 1px solid #d8e1ee;
      box-shadow: 0 12px 30px rgba(8, 20, 36, 0.25);
      padding: 0.9rem;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8rem;
      margin-bottom: 0.6rem;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 1.1rem;
      color: #1a3f70;
    }

    .confirm-modal {
      width: min(92vw, 32rem);
    }

    .confirm-text {
      margin: 0.25rem 0 0.8rem;
      color: #334b68;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .intake-table-wrap {
      overflow-x: auto;
      border: 1px solid #d8e1ee;
      border-radius: 0.5rem;
    }

    .intake-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 72rem;
    }

    .intake-table th,
    .intake-table td {
      border-bottom: 1px solid #e6edf5;
      border-right: 1px solid #e6edf5;
      padding: 0.5rem;
      text-align: left;
      color: #334b68;
      font-size: 0.86rem;
      white-space: nowrap;
      vertical-align: top;
    }

    .intake-table th:last-child,
    .intake-table td:last-child {
      border-right: 0;
    }

    .intake-table th {
      background: #f4f8fc;
      font-weight: 700;
      color: #1a3f70;
    }

    .intake-row {
      cursor: pointer;
    }

    .intake-row:hover {
      background: #f7fbff;
    }

    .intake-row.selected {
      background: #e9f2ff;
    }

    .intake-desc {
      max-width: 28rem;
      white-space: normal;
      word-break: break-word;
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

    .assignment-form {
      display: grid;
      gap: 0.75rem;
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

    input[list] {
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path fill="%231a3f70" d="M6 9L1 4h10z"/></svg>');
      background-repeat: no-repeat;
      background-position: right 0.5rem center;
      background-size: 1rem;
      padding-right: 2rem;
    }

    @supports (appearance: none) {
      input[list] {
        appearance: none;
      }
    }

    .estimate-input {
      width: 6ch;
      min-width: 6ch;
      max-width: 6ch;
    }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid #d8e1ee;
      border-radius: 0.5rem;
    }

    .view-header-row {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      margin-bottom: 0.6rem;
    }

    .view-header-row .empty-state {
      margin: 0;
    }

    .view-header-row .small-btn {
      margin-left: auto;
    }

    .assignment-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1300px;
    }

    .assignment-table th,
    .assignment-table td {
      border-bottom: 1px solid #e6edf5;
      padding: 0.5rem;
      text-align: left;
      color: #334b68;
      font-size: 0.86rem;
      white-space: nowrap;
      vertical-align: top;
    }

    .assignment-table th {
      background: #f4f8fc;
      font-weight: 700;
      color: #1a3f70;
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

    .empty-state {
      margin: 0;
      color: #42586f;
    }

    .error-message {
      margin: 0.6rem 0 0;
      color: #9c1e1e;
      font-weight: 600;
    }
  `
})
export class ResourceManagementComponent {
  protected readonly mode = signal<'add' | 'view'>('add');
  protected readonly assignments = signal<Assignment[]>([]);
  protected readonly saveError = signal('');
  protected readonly viewError = signal('');
  protected readonly tableActionError = signal('');
  protected readonly isSaving = signal(false);
  protected readonly isLoadingAssignments = signal(false);
  protected readonly isIntakeLogOpen = signal(false);
  protected readonly isLoadingIntakeLog = signal(false);
  protected readonly intakeLogError = signal('');
  protected readonly intakeLogEntries = signal<IntakeLogEntry[]>([]);
  protected readonly showPostSavePrompt = signal(false);
  protected readonly lastSavedAssignmentDraft = signal<AssignmentDraft | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly editModeEnabled = signal(false);
  protected readonly selectedIntakeRowKey = signal('');
  protected readonly users = signal<{ lanId: string; name: string; role?: string }[]>([]);
  protected readonly isLoadingUsers = signal(false);
  protected readonly usersError = signal('');
  protected readonly addResourceFilter = signal('');
  protected readonly editResourceFilter = signal('');
  protected readonly addResourceSearchResults = signal<{ lanId: string; name: string; role?: string }[]>([]);
  protected readonly editResourceSearchResults = signal<{ lanId: string; name: string; role?: string }[]>([]);
  protected readonly isSearchingAddResources = signal(false);
  protected readonly isSearchingEditResources = signal(false);
  private addResourceSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  private editResourceSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  protected readonly addDraft = signal<AssignmentDraft>({
    workOrderNumber: '',
    projectName: '',
    projectLead: '',
    resourceAssigned: '',
    projectStartDate: '',
    projectEndDate: '',
    estimate: '',
    projectOrderNumber: '',
    status: 'In-Progress'
  });
  protected readonly editDraft = signal<AssignmentDraft>({
    workOrderNumber: '',
    projectName: '',
    projectLead: '',
    resourceAssigned: '',
    projectStartDate: '',
    projectEndDate: '',
    estimate: '',
    projectOrderNumber: '',
    status: 'In-Progress'
  });

  // Computed signals for filtering available resources - returns search results or all users
  protected readonly filteredAddResourceUsers = computed(() => {
    const searchResults = this.addResourceSearchResults();
    if (searchResults.length > 0) {
      return searchResults;
    }
    return this.users();
  });

  protected readonly filteredEditResourceUsers = computed(() => {
    const searchResults = this.editResourceSearchResults();
    if (searchResults.length > 0) {
      return searchResults;
    }
    return this.users();
  });

  constructor() {
    effect(() => {
      void this.loadUsers();
    });
  }

  protected setMode(mode: 'add' | 'view'): void {
    this.mode.set(mode);
    this.tableActionError.set('');

    if (mode === 'add') {
      this.editModeEnabled.set(false);
      this.editingId.set(null);
      // Refresh user list when entering Add mode to show any newly added users
      void this.loadUsers();
    }

    if (mode === 'view') {
      this.editModeEnabled.set(false);
      void this.loadAssignments();
    }
  }

  protected enableEditMode(): void {
    this.mode.set('view');
    this.editModeEnabled.set(true);
    this.tableActionError.set('');
    // Refresh user list when entering Edit mode to show any newly added users
    void this.loadUsers();
    void this.loadAssignments();
  }

  protected openIntakeLogPopup(): void {
    this.isIntakeLogOpen.set(true);
    void this.loadIntakeLogEntries();
  }

  protected closeIntakeLogPopup(): void {
    this.isIntakeLogOpen.set(false);
  }

  protected async submitAssignment(event: Event): Promise<void> {
    event.preventDefault();
    if (this.isSaving()) {
      return;
    }

    this.saveError.set('');

    const draft = this.addDraft();
    
    // Validate that resource exists in Users table
    const resourceTrimmed = draft.resourceAssigned.trim();
    const resourceExists = this.users().some(
      u => u.name === resourceTrimmed || u.lanId === resourceTrimmed
    );

    if (!resourceExists && resourceTrimmed) {
      this.saveError.set(`Resource "${resourceTrimmed}" not found in the Users database. Please select from the available options.`);
      return;
    }

    const payload: AssignmentDraft = {
      workOrderNumber: draft.workOrderNumber.trim(),
      projectName: draft.projectName.trim(),
      projectLead: draft.projectLead.trim(),
      resourceAssigned: draft.resourceAssigned.trim(),
      projectStartDate: draft.projectStartDate.trim(),
      projectEndDate: draft.projectEndDate.trim(),
      estimate: (draft.estimate || '').trim() || undefined,
      projectOrderNumber: draft.projectOrderNumber.trim(),
      status: this.normalizeStatus(draft.status)
    };

    if (
      !payload.workOrderNumber ||
      !payload.projectName ||
      !payload.projectLead ||
      !payload.resourceAssigned ||
      !payload.projectStartDate ||
      !payload.projectEndDate ||
      !payload.projectOrderNumber
    ) {
      this.saveError.set('Please fill all required fields before saving.');
      return;
    }

    this.isSaving.set(true);
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/resource-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.saveError.set(errorBody.message || 'Unable to save resource assignment.');
        return;
      }

      this.lastSavedAssignmentDraft.set({
        ...payload,
        estimate: payload.estimate || ''
      });
      this.showPostSavePrompt.set(true);
      return;
    } catch {
      this.saveError.set('Unable to save resource assignment.');
    } finally {
      this.isSaving.set(false);
    }
  }

  protected onPostSavePromptChoice(addAnother: boolean): void {
    const savedDraft = this.lastSavedAssignmentDraft();
    this.showPostSavePrompt.set(false);
    this.lastSavedAssignmentDraft.set(null);

    if (addAnother && savedDraft) {
      this.addDraft.set({
        workOrderNumber: savedDraft.workOrderNumber,
        projectName: savedDraft.projectName,
        projectLead: savedDraft.projectLead,
        resourceAssigned: '',
        projectStartDate: savedDraft.projectStartDate,
        projectEndDate: savedDraft.projectEndDate,
        estimate: savedDraft.estimate || '',
        projectOrderNumber: savedDraft.projectOrderNumber,
        status: savedDraft.status
      });
      this.setMode('add');
      return;
    }

    this.resetAddDraft();
    this.setMode('view');
  }

  protected startEdit(assignment: Assignment): void {
    this.tableActionError.set('');
    this.editingId.set(assignment.id);
    this.editDraft.set({
      workOrderNumber: assignment.workOrderNumber,
      projectName: assignment.projectName,
      projectLead: assignment.projectLead,
      resourceAssigned: assignment.resourceAssigned,
      projectStartDate: assignment.projectStartDate,
      projectEndDate: assignment.projectEndDate,
      estimate: assignment.estimate || '',
      projectOrderNumber: assignment.projectOrderNumber,
      status: assignment.status
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected updateAddDraftField(field: keyof AssignmentDraft, value: string): void {
    this.addDraft.update((currentDraft) => ({
      ...currentDraft,
      [field]: field === 'status' ? this.normalizeStatus(value) : value
    }));

    // Trigger search when resourceAssigned field changes
    if (field === 'resourceAssigned') {
      this.debounceAddResourceSearch(value);
    }
  }

  protected highlightIntakeLogEntry(entry: IntakeLogEntry): void {
    this.selectedIntakeRowKey.set(this.buildIntakeRowKey(entry));
  }

  protected selectIntakeLogEntry(entry: IntakeLogEntry): void {
    this.selectedIntakeRowKey.set(this.buildIntakeRowKey(entry));

    // Map intake values to the closest Resource Management fields for quick prefill.
    this.addDraft.set({
      workOrderNumber: entry.ticketId || '',
      projectName: entry.requestTitle || '',
      projectLead: entry.customer || '',
      resourceAssigned: '',
      projectStartDate: this.normalizeDateValue(entry.scheduledStartDate),
      projectEndDate: this.normalizeDateValue(entry.scheduledEndDate),
      estimate: '',
      projectOrderNumber: entry.orderNumber || '',
      status: 'In-Progress'
    });

    this.saveError.set('');
    this.setMode('add');
    this.closeIntakeLogPopup();
  }

  protected updateDraftField(field: keyof AssignmentDraft, value: string): void {
    this.editDraft.update((currentDraft) => ({
      ...currentDraft,
      [field]: field === 'status' ? this.normalizeStatus(value) : value
    }));

    // Trigger search when resourceAssigned field changes
    if (field === 'resourceAssigned') {
      this.debounceEditResourceSearch(value);
    }
  }

  protected async saveEdit(id: number): Promise<void> {
    const payload = this.editDraft();

    // Validate that resource exists in Users table
    const resourceTrimmed = payload.resourceAssigned.trim();
    const resourceExists = this.users().some(
      u => u.name === resourceTrimmed || u.lanId === resourceTrimmed
    );

    if (!resourceExists && resourceTrimmed) {
      this.tableActionError.set(`Resource "${resourceTrimmed}" not found in the Users database. Please select from the available options.`);
      return;
    }

    if (
      !payload.workOrderNumber.trim() ||
      !payload.projectName.trim() ||
      !payload.projectLead.trim() ||
      !payload.resourceAssigned.trim() ||
      !payload.projectStartDate.trim() ||
      !payload.projectEndDate.trim() ||
      !payload.projectOrderNumber.trim()
    ) {
      this.tableActionError.set('All required fields must be filled before saving edit.');
      return;
    }

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/resource-assignments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status: this.normalizeStatus(payload.status) })
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.tableActionError.set(errorBody.message || 'Unable to update assignment.');
        return;
      }

      this.editingId.set(null);
      await this.loadAssignments();
    } catch {
      this.tableActionError.set('Unable to update assignment.');
    }
  }

  protected async deleteAssignment(id: number): Promise<void> {
    this.tableActionError.set('');

    const confirmed = window.confirm(
      'Are you sure you want to delete this resource assignment? This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/resource-assignments/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.tableActionError.set(errorBody.message || 'Unable to delete assignment.');
        return;
      }

      await this.loadAssignments();
    } catch {
      this.tableActionError.set('Unable to delete assignment.');
    }
  }

  protected exportAssignmentsToExcel(): void {
    const rows = this.assignments();
    if (rows.length === 0) {
      this.tableActionError.set('No assignments available to export.');
      return;
    }

    const headers = [
      'Work Order#',
      'Project Name',
      'Project Lead',
      'Resource Assigned',
      'Project Start Date',
      'Project End Date',
      'Estimated Hours',
      'Project Order Number',
      'Status'
    ];

    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        [
          row.workOrderNumber,
          row.projectName,
          row.projectLead,
          row.resourceAssigned,
          row.projectStartDate,
          row.projectEndDate,
          row.estimate || '',
          row.projectOrderNumber,
          row.status
        ]
          .map((value) => this.escapeCsvValue(value))
          .join(',')
      )
    ];

    const blob = new Blob([`\uFEFF${csvLines.join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileStamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `resource-assignments-${fileStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private async loadAssignments(): Promise<void> {
    this.isLoadingAssignments.set(true);
    this.viewError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/resource-assignments`);
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.viewError.set(errorBody.message || 'Unable to load resource assignments.');
        this.assignments.set([]);
        return;
      }

      const result = (await response.json()) as { assignments?: Assignment[] };
      this.assignments.set(result.assignments ?? []);
    } catch {
      this.viewError.set('Unable to load resource assignments.');
      this.assignments.set([]);
    } finally {
      this.isLoadingAssignments.set(false);
    }
  }

  private async loadUsers(): Promise<void> {
    this.isLoadingUsers.set(true);
    this.usersError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/admin/users`, {
        headers: {
          ...this.getAuthorizationHeader()
        }
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.usersError.set(errorBody.message || 'Unable to load users.');
        this.users.set([]);
        return;
      }

      const result = (await response.json()) as { users?: { lanId: string; name: string; role?: string }[] };
      this.users.set(result.users ?? []);
    } catch {
      this.usersError.set('Unable to load users.');
      this.users.set([]);
    } finally {
      this.isLoadingUsers.set(false);
    }
  }

  private async loadIntakeLogEntries(): Promise<void> {
    this.isLoadingIntakeLog.set(true);
    this.intakeLogError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/intake-log`);
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.intakeLogError.set(errorBody.message || 'Unable to load intake log records.');
        this.intakeLogEntries.set([]);
        return;
      }

      const result = (await response.json()) as { intakeLog?: IntakeLogEntry[] };
      this.intakeLogEntries.set(result.intakeLog ?? []);
    } catch {
      this.intakeLogError.set('Unable to load intake log records.');
      this.intakeLogEntries.set([]);
    } finally {
      this.isLoadingIntakeLog.set(false);
    }
  }

  private debounceAddResourceSearch(query: string): void {
    if (this.addResourceSearchTimeout) {
      clearTimeout(this.addResourceSearchTimeout);
    }

    const trimmedQuery = query.trim();

    // If query is empty, clear search results and show all users
    if (!trimmedQuery) {
      this.addResourceSearchResults.set([]);
      return;
    }

    this.addResourceSearchTimeout = setTimeout(() => {
      void this.searchResources(trimmedQuery, 'add');
    }, 300);
  }

  private debounceEditResourceSearch(query: string): void {
    if (this.editResourceSearchTimeout) {
      clearTimeout(this.editResourceSearchTimeout);
    }

    const trimmedQuery = query.trim();

    // If query is empty, clear search results and show all users
    if (!trimmedQuery) {
      this.editResourceSearchResults.set([]);
      return;
    }

    this.editResourceSearchTimeout = setTimeout(() => {
      void this.searchResources(trimmedQuery, 'edit');
    }, 300);
  }

  private async searchResources(query: string, mode: 'add' | 'edit'): Promise<void> {
    const isAdd = mode === 'add';
    if (isAdd) {
      this.isSearchingAddResources.set(true);
    } else {
      this.isSearchingEditResources.set(true);
    }

    try {
      // Search locally first from the users list for instant results
      const localResults = this.users().filter(
        u =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.lanId.toLowerCase().includes(query.toLowerCase())
      );

      if (isAdd) {
        this.addResourceSearchResults.set(localResults);
      } else {
        this.editResourceSearchResults.set(localResults);
      }

      // Optionally fetch fresh data from API to ensure up-to-date results
      // This helps when users are added/updated and the local list might be stale
      const response = await fetch(`${this.getApiBaseUrl()}/api/admin/users`, {
        headers: {
          ...this.getAuthorizationHeader()
        }
      });

      if (!response.ok) {
        // If API call fails, use the local results
        return;
      }

      const result = (await response.json()) as {
        users?: { lanId: string; name: string; role?: string }[];
      };
      const freshUsers = result.users ?? [];

      // Update the main users list in case there are new users
      this.users.set(freshUsers);

      // Filter fresh results
      const freshResults = freshUsers.filter(
        u =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.lanId.toLowerCase().includes(query.toLowerCase())
      );

      if (isAdd) {
        this.addResourceSearchResults.set(freshResults);
      } else {
        this.editResourceSearchResults.set(freshResults);
      }
    } catch {
      // On error, use whatever local results we had
      // Results are already set above from local search
    } finally {
      if (isAdd) {
        this.isSearchingAddResources.set(false);
      } else {
        this.isSearchingEditResources.set(false);
      }
    }
  }

  private normalizeStatus(status: string): AssignmentStatus {
    if (status === 'Backfill Needed' || status === 'Complete' || status === 'Closed') {
      return status;
    }

    return 'In-Progress';
  }

  private buildIntakeRowKey(entry: IntakeLogEntry): string {
    return `${entry.ticketId}-${entry.requestTitle}`;
  }

  private normalizeDateValue(value: string): string {
    if (!value) {
      return '';
    }

    const trimmed = value.trim();
    const dateCandidate = trimmed.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)) {
      return dateCandidate;
    }

    const parsedDate = new Date(trimmed);
    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }

    return parsedDate.toISOString().slice(0, 10);
  }

  private getApiBaseUrl(): string {
    return resolveApiBaseUrl();
  }

  private getAuthorizationHeader(): Record<string, string> {
    const token = localStorage.getItem('irp_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private resetAddDraft(): void {
    this.addDraft.set({
      workOrderNumber: '',
      projectName: '',
      projectLead: '',
      resourceAssigned: '',
      projectStartDate: '',
      projectEndDate: '',
      estimate: '',
      projectOrderNumber: '',
      status: 'In-Progress'
    });
  }

  private escapeCsvValue(value: string): string {
    const normalized = String(value ?? '');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
