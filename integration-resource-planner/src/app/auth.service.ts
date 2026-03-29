import { Injectable, signal } from '@angular/core';
import { resolveApiBaseUrl } from './api-base-url';

type AuthUser = {
  username: string;
  displayName: string;
  email: string;
  sAMAccountName?: string;
  userPrincipalName?: string;
  cn?: string;
  dn?: string;
  department?: string;
  title?: string;
  manager?: string;
  physicalDeliveryOfficeName?: string;
  telephoneNumber?: string;
  appRole?: string;
};

type LoginResponse = {
  status: string;
  token: string;
  user: AuthUser;
  message?: string;
};

type MeResponse = {
  status: string;
  user: AuthUser;
};

const TOKEN_KEY = 'irp_auth_token';
const USER_KEY = 'irp_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiBaseUrl = resolveApiBaseUrl();
  private readonly authToken = signal('');
  private readonly authUser = signal<AuthUser | null>(null);

  constructor() {
    this.restoreAuthState();
  }

  isAuthenticated(): boolean {
    return Boolean(this.authToken());
  }

  currentUser(): AuthUser | null {
    return this.authUser();
  }

  currentRole(): string {
    return this.authUser()?.appRole || '';
  }

  private normalizedRole(): string {
    return this.currentRole().trim().toLowerCase();
  }

  isAdmin(): boolean {
    return this.normalizedRole() === 'admin';
  }

  isResourceManager(): boolean {
    return this.normalizedRole() === 'resource manager';
  }

  isPractitioner(): boolean {
    return this.normalizedRole() === 'practitioner';
  }

  canAccessResourceAssignment(): boolean {
    return this.isAdmin() || this.isResourceManager();
  }

  canAccessDeliverableManagement(): boolean {
    return this.isAdmin() || this.isResourceManager() || this.isPractitioner();
  }

  canAccessDailyOperatingReview(): boolean {
    return this.isAdmin() || this.isResourceManager() || this.isPractitioner();
  }

  canAccessResourceForecast(): boolean {
    return this.isAdmin() || this.isResourceManager() || this.isPractitioner();
  }

  authorizationHeader(): Record<string, string> {
    const token = this.authToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async login(username: string, password: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<LoginResponse>;

      if (!response.ok || !payload.token || !payload.user) {
        return {
          ok: false,
          message: payload.message || 'Login failed. Please verify your PG&E credentials.',
        };
      }

      this.authToken.set(payload.token);
      this.authUser.set(payload.user);

      localStorage.setItem(TOKEN_KEY, payload.token);
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));

      return { ok: true };
    } catch {
      return {
        ok: false,
        message: 'Unable to reach authentication service. Please check your network and try again.',
      };
    }
  }

  logout(): void {
    this.authToken.set('');
    this.authUser.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private restoreAuthState(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY) || '';
    const rawUser = localStorage.getItem(USER_KEY) || '';

    if (!token || !rawUser) {
      return;
    }

    try {
      const user = JSON.parse(rawUser) as AuthUser;
      if (!user || !user.username) {
        return;
      }

      this.authToken.set(token);
      this.authUser.set(user);
      void this.refreshCurrentUser();
    } catch {
      this.logout();
    }
  }

  private async refreshCurrentUser(): Promise<void> {
    const token = this.authToken();
    if (!token) {
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          ...this.authorizationHeader(),
        },
      });

      if (!response.ok) {
        this.logout();
        return;
      }

      const payload = (await response.json().catch(() => null)) as MeResponse | null;
      if (!payload?.user?.username) {
        this.logout();
        return;
      }

      this.authUser.set(payload.user);
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
    } catch {
      // Keep locally restored session on transient network errors.
    }
  }
}
