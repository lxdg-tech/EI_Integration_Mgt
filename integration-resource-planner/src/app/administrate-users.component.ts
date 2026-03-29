import { Component, OnInit, computed, signal, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';
import { resolveApiBaseUrl } from './api-base-url';

type AppUser = {
  lanId: string;
  name: string;
  role: string;
  pendingRole: string;
  saving: boolean;
  deleting: boolean;
  saved: boolean;
  deleted: boolean;
  error: string;
};

@Component({
  selector: 'app-administrate-users',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="admin-page">
      <section class="admin-card">
        <h1>Administration</h1>

        <p class="helper-text">
          Manage application roles for users in the system. Only users from the Users table can be assigned roles. Changes take effect the next time the user logs in.
        </p>

        <div class="page-toggle-row" role="group" aria-label="Admin management pages">
          <button
            type="button"
            class="page-toggle-btn"
            (click)="openUploadTimeReport()"
          >
            Upload Time Rpt
          </button>
          <button
            type="button"
            class="page-toggle-btn"
            [class.active]="activePage() === 'role'"
            (click)="setActivePage('role')"
          >
            Role Management
          </button>
          <button
            type="button"
            class="page-toggle-btn"
            [class.active]="activePage() === 'user'"
            (click)="setActivePage('user')"
          >
            User Management
          </button>
        </div>

        @if (loadError()) {
          <div class="alert-error">{{ loadError() }}</div>
        }

        @if (activePage() === 'role' && loading()) {
          <p class="loading-text">Loading users&hellip;</p>
        } @else if (activePage() === 'role') {
          <div class="section-action-row">
            <button type="button" class="export-btn" (click)="exportUsersToExcel('role-management')">
              Export to Excel
            </button>
          </div>

          <div class="filter-row">
            <label for="lan-id-filter">Filter by LAN ID</label>
            <input
              id="lan-id-filter"
              type="text"
              class="lan-filter-input"
              [ngModel]="lanIdFilter()"
              (ngModelChange)="lanIdFilter.set(($event || '').trim())"
              placeholder="Type LAN ID"
            />

            <label for="name-filter">Filter by Name</label>
            <input
              id="name-filter"
              type="text"
              class="name-filter-input"
              [ngModel]="nameFilter()"
              (ngModelChange)="nameFilter.set(($event || '').trim())"
              placeholder="Type Name"
            />
          </div>

          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>LAN ID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                @for (user of filteredUsers(); track user.lanId) {
                  <tr>
                    <td>{{ user.lanId }}</td>
                    <td>{{ user.name }}</td>
                    <td>
                      <select [(ngModel)]="user.pendingRole" class="role-select">
                        <option value="">— No Role —</option>
                        @for (role of availableRoles; track role) {
                          <option [value]="role">{{ role }}</option>
                        }
                      </select>
                    </td>
                    <td>
                      @if (!user.role) {
                        <button
                          type="button"
                          class="add-btn"
                          [disabled]="user.saving || user.deleting || !user.pendingRole"
                          (click)="addAccess(user)"
                          title="Assign a role to this user"
                        >
                          {{ user.saving ? 'Adding…' : 'Add Access' }}
                        </button>
                      } @else {
                        <button
                          type="button"
                          class="update-btn"
                          [disabled]="user.saving || user.deleting || user.pendingRole === user.role"
                          (click)="updateAccess(user)"
                          title="Update this user's role"
                        >
                          {{ user.saving ? 'Updating…' : 'Update Access' }}
                        </button>
                        <button
                          type="button"
                          class="delete-btn"
                          [disabled]="user.saving || user.deleting"
                          (click)="deleteAccess(user)"
                          title="Remove this user's role access"
                        >
                          {{ user.deleting ? 'Deleting…' : 'Delete Access' }}
                        </button>
                      }
                      @if (user.saved) {
                        <span class="status-ok">✓ Saved</span>
                      }
                      @if (user.deleted) {
                        <span class="status-ok">✓ Deleted</span>
                      }
                      @if (user.error) {
                        <span class="status-err">{{ user.error }}</span>
                      }
                    </td>
                  </tr>
                }
                @if (filteredUsers().length === 0) {
                  <tr>
                    <td colspan="4" class="empty-row">No users match the selected LAN ID filter.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <section class="user-mgt-panel">
            <h2>User Management</h2>
            <p>View, add, update, and delete users from the Users table.</p>

            <div class="filter-row">
              <label for="user-lan-id-filter">Filter by LAN ID</label>
              <input
                id="user-lan-id-filter"
                type="text"
                class="lan-filter-input"
                [ngModel]="lanIdFilter()"
                (ngModelChange)="lanIdFilter.set(($event || '').trim())"
                placeholder="Type LAN ID"
              />

              <label for="user-name-filter">Filter by Name</label>
              <input
                id="user-name-filter"
                type="text"
                class="name-filter-input"
                [ngModel]="nameFilter()"
                (ngModelChange)="nameFilter.set(($event || '').trim())"
                placeholder="Type Name"
              />
            </div>

            <form class="user-form" (submit)="saveUser($event)">
              <label>
                LAN ID
                <input
                  type="text"
                  required
                  [ngModel]="userFormLanId()"
                  (ngModelChange)="userFormLanId.set(($event || '').trim())"
                  name="userFormLanId"
                  placeholder="e.g. LXDG"
                />
              </label>

              <label>
                Name
                <input
                  type="text"
                  required
                  [ngModel]="userFormName()"
                  (ngModelChange)="userFormName.set($event || '')"
                  name="userFormName"
                  placeholder="User full name"
                />
              </label>

              <div class="user-form-actions">
                <button type="submit" class="add-btn" [disabled]="userFormSaving()">
                  {{ userFormSaving() ? 'Saving…' : (userFormMode() === 'add' ? 'Add User' : 'Update User') }}
                </button>
                @if (userFormMode() === 'edit') {
                  <button type="button" class="update-btn" [disabled]="userFormSaving()" (click)="cancelUserEdit()">
                    Cancel Edit
                  </button>
                }
              </div>
            </form>

            @if (userFormError()) {
              <div class="alert-error">{{ userFormError() }}</div>
            }

            @if (userFormSuccess()) {
              <div class="user-form-success">{{ userFormSuccess() }}</div>
            }

            <div class="section-action-row">
              <button type="button" class="export-btn" (click)="exportUsersToExcel('user-management')">
                Export to Excel
              </button>
            </div>

            <p class="user-count">Current users loaded: {{ users().length }}</p>

            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>LAN ID</th>
                    <th>Name</th>
                    <th>IRP Role</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  @for (user of filteredUsers(); track user.lanId) {
                    <tr>
                      <td>{{ user.lanId }}</td>
                      <td>{{ user.name }}</td>
                      <td>{{ user.role || '—' }}</td>
                      <td>
                        <button
                          type="button"
                          class="update-btn"
                          [disabled]="userFormSaving()"
                          (click)="startUserEdit(user)"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          class="delete-btn"
                          [disabled]="userFormSaving()"
                          (click)="deleteUser(user)"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  }
                  @if (filteredUsers().length === 0) {
                    <tr>
                      <td colspan="4" class="empty-row">No users match the selected filter.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        <div class="button-row">
          <button type="button" class="close-btn" (click)="close()">Close</button>
        </div>
      </section>
    </main>
  `,
  styles: `
    .admin-page {
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }

    .admin-card {
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

    .helper-text {
      color: #555;
      margin: 0 0 1.5rem;
    }

    .page-toggle-row {
      display: flex;
      gap: 0.75rem;
      margin: 0 0 1rem;
      flex-wrap: wrap;
    }

    .page-toggle-btn {
      border: 1px solid #1f4d85;
      background: #ffffff;
      color: #1f4d85;
      border-radius: 6px;
      padding: 0.45rem 0.9rem;
      font-weight: 700;
      cursor: pointer;
    }

    .page-toggle-btn.active {
      background: #1f4d85;
      color: #ffffff;
    }

    .page-toggle-btn:hover {
      background: #173c69;
      color: #ffffff;
    }

    .user-mgt-panel {
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 1rem;
      background: #fafafa;
      margin-bottom: 1.5rem;
    }

    .user-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .user-form-actions {
      grid-column: 1 / -1;
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .user-form-success {
      background: #edf7ed;
      border: 1px solid #2e7d32;
      border-radius: 4px;
      color: #1b5e20;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
    }

    .section-action-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.75rem;
    }

    .export-btn {
      border: 1px solid #1f4d85;
      background: #ffffff;
      color: #1f4d85;
      border-radius: 6px;
      padding: 0.45rem 0.85rem;
      font-weight: 700;
      cursor: pointer;
    }

    .export-btn:hover {
      background: #1f4d85;
      color: #ffffff;
    }

    .user-mgt-panel h2 {
      margin: 0 0 0.75rem;
      color: #1f4d85;
      font-size: 1.15rem;
    }

    .user-count {
      margin-top: 0.75rem;
      font-weight: 700;
      color: #333;
    }

    .loading-text {
      color: #777;
      font-style: italic;
    }

    .alert-error {
      background: #fdecea;
      border: 1px solid #f44336;
      border-radius: 4px;
      color: #b71c1c;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
    }

    .table-wrapper {
      overflow-x: auto;
      margin-bottom: 1.5rem;
    }

    .filter-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .filter-row label {
      color: #1f4d85;
      font-weight: 700;
      white-space: nowrap;
    }

    .lan-filter-input {
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 0.35rem 0.55rem;
      font-size: 0.875rem;
      min-width: 220px;
    }

    .name-filter-input {
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 0.35rem 0.55rem;
      font-size: 0.875rem;
      min-width: 260px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    thead th {
      background: #1f4d85;
      color: #fff;
      padding: 0.6rem 0.75rem;
      text-align: left;
      white-space: nowrap;
    }

    tbody tr:nth-child(even) {
      background: #f9f9f9;
    }

    tbody td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid #e8e8e8;
      vertical-align: middle;
    }

    .role-select {
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 0.3rem 0.5rem;
      font-size: 0.875rem;
      min-width: 160px;
    }

    .add-btn, .update-btn {
      border: 1px solid #1f4d85;
      background: #1f4d85;
      color: #fff;
      border-radius: 4px;
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      margin-right: 0.5rem;
    }

    .add-btn:hover:not(:disabled),
    .update-btn:hover:not(:disabled) {
      background: #173c69;
    }

    .add-btn:disabled,
    .update-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .delete-btn {
      border: 1px solid #c62828;
      background: #c62828;
      color: #fff;
      border-radius: 4px;
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
    }

    .delete-btn:hover:not(:disabled) {
      background: #b71c1c;
    }

    .delete-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .status-ok {
      color: #2e7d32;
      font-weight: 700;
      margin-left: 0.5rem;
      font-size: 0.85rem;
    }

    .status-err {
      color: #c62828;
      margin-left: 0.5rem;
      font-size: 0.8rem;
    }

    .empty-row {
      text-align: center;
      color: #888;
      padding: 1.5rem;
    }

    .button-row {
      display: flex;
      justify-content: flex-end;
    }

    .close-btn {
      border: 1px solid #1f4d85;
      background: #1f4d85;
      color: #fff;
      border-radius: 6px;
      padding: 0.55rem 1rem;
      font-weight: 700;
      cursor: pointer;
    }

    .close-btn:hover {
      background: #173c69;
    }
  `,
})
export class AdministrateUsersComponent implements OnInit {
  protected readonly activePage = signal<'role' | 'user'>('role');
  protected readonly users = signal<AppUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly userFormMode = signal<'add' | 'edit'>('add');
  protected readonly userFormLanId = signal('');
  protected readonly userFormName = signal('');
  protected readonly userFormOriginalLanId = signal('');
  protected readonly userFormSaving = signal(false);
  protected readonly userFormError = signal('');
  protected readonly userFormSuccess = signal('');
  protected readonly lanIdFilter = signal('');
  protected readonly nameFilter = signal('');
  protected readonly filteredUsers = computed(() => {
    const lanFilter = this.lanIdFilter().toLowerCase();
    const displayNameFilter = this.nameFilter().toLowerCase();

    return this.users().filter((u) => {
      const lanMatch = !lanFilter || u.lanId.toLowerCase().includes(lanFilter);
      const nameMatch = !displayNameFilter || u.name.toLowerCase().includes(displayNameFilter);
      return lanMatch && nameMatch;
    });
  });

  protected readonly availableRoles = ['Admin', 'Resource Manager', 'Practitioner'];

  private readonly apiBaseUrl = resolveApiBaseUrl();

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadUsers();
  }

  protected setActivePage(page: 'role' | 'user'): void {
    this.activePage.set(page);
    this.userFormError.set('');
    this.userFormSuccess.set('');
  }

  protected openUploadTimeReport(): void {
    void this.router.navigateByUrl('/upload-time-report');
  }

  protected startUserEdit(user: AppUser): void {
    this.userFormMode.set('edit');
    this.userFormOriginalLanId.set(user.lanId);
    this.userFormLanId.set(user.lanId);
    this.userFormName.set(user.name);
    this.userFormError.set('');
    this.userFormSuccess.set('');
  }

  protected cancelUserEdit(): void {
    this.userFormMode.set('add');
    this.userFormOriginalLanId.set('');
    this.userFormLanId.set('');
    this.userFormName.set('');
    this.userFormError.set('');
    this.userFormSuccess.set('');
  }

  protected async saveUser(event: Event): Promise<void> {
    event.preventDefault();

    const lanId = this.userFormLanId().trim();
    const name = this.userFormName().trim();
    if (!lanId || !name) {
      this.userFormError.set('LAN ID and Name are required.');
      this.userFormSuccess.set('');
      return;
    }

    this.userFormSaving.set(true);
    this.userFormError.set('');
    this.userFormSuccess.set('');

    try {
      const isAddMode = this.userFormMode() === 'add';
      const response = await fetch(
        `${this.apiBaseUrl}/api/admin/users${isAddMode ? '' : ''}`,
        {
          method: isAddMode ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...this.authService.authorizationHeader(),
          },
          body: JSON.stringify(
            isAddMode
              ? { lanId, name }
              : {
                  originalLanId: this.userFormOriginalLanId(),
                  lanId,
                  name,
                }
          ),
        }
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        this.userFormError.set(body.message || (isAddMode ? 'Unable to add user.' : 'Unable to update user.'));
        return;
      }

      this.userFormSuccess.set(isAddMode ? 'User added successfully.' : 'User updated successfully.');
      this.cancelUserEdit();
      this.userFormSuccess.set(isAddMode ? 'User added successfully.' : 'User updated successfully.');
      await this.loadUsers();
    } catch {
      this.userFormError.set('Network error. Please try again.');
    } finally {
      this.userFormSaving.set(false);
    }
  }

  protected async deleteUser(user: AppUser): Promise<void> {
    if (!confirm(`Delete user "${user.name}" (${user.lanId}) from Users table?`)) {
      return;
    }

    this.userFormSaving.set(true);
    this.userFormError.set('');
    this.userFormSuccess.set('');

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/admin/users/${encodeURIComponent(user.lanId)}`, {
        method: 'DELETE',
        headers: {
          ...this.authService.authorizationHeader(),
        },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        this.userFormError.set(body.message || 'Unable to delete user.');
        return;
      }

      if (this.userFormMode() === 'edit' && this.userFormOriginalLanId() === user.lanId) {
        this.cancelUserEdit();
      }

      this.userFormSuccess.set('User deleted successfully.');
      await this.loadUsers();
    } catch {
      this.userFormError.set('Network error. Please try again.');
    } finally {
      this.userFormSaving.set(false);
    }
  }

  private async loadUsers(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/admin/users`, {
        headers: { ...this.authService.authorizationHeader() },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        this.loadError.set(body.message || 'Failed to load users.');
        return;
      }
      const payload = (await response.json()) as { users: { lanId: string; name: string; role: string }[] };
      this.users.set(
        (payload.users || []).map((u) => ({
          lanId: u.lanId,
          name: u.name,
          role: u.role,
          pendingRole: u.role,
          saving: false,
          deleting: false,
          saved: false,
          deleted: false,
          error: '',
        }))
      );
    } catch {
      this.loadError.set('Network error while loading users.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async addAccess(user: AppUser): Promise<void> {
    user.saving = true;
    user.saved = false;
    user.deleted = false;
    user.error = '';
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/admin/users/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.authService.authorizationHeader(),
        },
        body: JSON.stringify({ lanId: user.lanId, name: user.name, role: user.pendingRole }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        user.error = body.message || 'Add access failed.';
        return;
      }
      user.role = user.pendingRole;
      user.saved = true;
      setTimeout(() => {
        user.saved = false;
        this.cdr.markForCheck();
      }, 3000);
    } catch {
      user.error = 'Network error. Please try again.';
    } finally {
      user.saving = false;
      this.cdr.markForCheck();
    }
  }

  protected async updateAccess(user: AppUser): Promise<void> {
    user.saving = true;
    user.saved = false;
    user.deleted = false;
    user.error = '';
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/admin/users/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.authService.authorizationHeader(),
        },
        body: JSON.stringify({ lanId: user.lanId, name: user.name, role: user.pendingRole }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        user.error = body.message || 'Update access failed.';
        return;
      }
      user.role = user.pendingRole;
      user.saved = true;
      setTimeout(() => {
        user.saved = false;
        this.cdr.markForCheck();
      }, 3000);
    } catch {
      user.error = 'Network error. Please try again.';
    } finally {
      user.saving = false;
      this.cdr.markForCheck();
    }
  }

  protected async deleteAccess(user: AppUser): Promise<void> {
    if (!confirm(`Remove "${user.name}" (${user.lanId}) from all access?`)) {
      return;
    }

    user.deleting = true;
    user.saved = false;
    user.deleted = false;
    user.error = '';
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/admin/users/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.authService.authorizationHeader(),
        },
        body: JSON.stringify({ lanId: user.lanId, name: user.name, role: '' }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        user.error = body.message || 'Delete access failed.';
        return;
      }
      user.role = '';
      user.pendingRole = '';
      user.deleted = true;
      setTimeout(() => {
        user.deleted = false;
        this.cdr.markForCheck();
      }, 3000);
    } catch {
      user.error = 'Network error. Please try again.';
    } finally {
      user.deleting = false;
      this.cdr.markForCheck();
    }
  }

  protected exportUsersToExcel(section: 'role-management' | 'user-management'): void {
    const rows = this.filteredUsers();
    if (rows.length === 0) {
      return;
    }

    const headers = ['LAN ID', 'Name', 'IRP Role'];
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        [row.lanId, row.name, row.role || '']
          .map((value) => this.escapeCsvValue(value))
          .join(',')
      ),
    ];

    const blob = new Blob([`\uFEFF${csvLines.join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileStamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `${section}-users-${fileStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private escapeCsvValue(value: string): string {
    const normalized = String(value ?? '');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  protected async close(): Promise<void> {
    await this.router.navigateByUrl('/resource-assignment');
  }
}

