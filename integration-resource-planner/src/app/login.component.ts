import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="login-shell">
      <div class="login-card">
        <div class="logo-section">
          <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 220 220" role="img" xmlns="http://www.w3.org/2000/svg">
              <rect width="220" height="220" rx="8" fill="#f2f2f2" />

              <path d="M70 76 H104 V106 H116 V76 H150" fill="none" stroke="#f2ba1f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M70 146 H104 V116 H116 V146 H150" fill="none" stroke="#f2ba1f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>

              <path d="M70 82 V76 H104 V112 H116 V76 H150 V82" fill="none" stroke="#1f90cf" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M70 138 V146 H104 V110 H116 V146 H150 V138" fill="none" stroke="#1f90cf" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>

              <circle cx="48" cy="76" r="20" fill="#f2ba1f"/>
              <circle cx="86" cy="48" r="20" fill="#1f90cf"/>
              <circle cx="134" cy="48" r="20" fill="#f2ba1f"/>
              <circle cx="172" cy="76" r="20" fill="#1f90cf"/>
              <circle cx="48" cy="146" r="20" fill="#f2ba1f"/>
              <circle cx="86" cy="174" r="20" fill="#1f90cf"/>
              <circle cx="134" cy="174" r="20" fill="#f2ba1f"/>
              <circle cx="172" cy="146" r="20" fill="#1f90cf"/>
            </svg>
          </div>
        </div>

        <h2>Integration Planning & Mgt</h2>

        <form (submit)="submit($event)">
          <label>
            Lan Id
            <input
              type="text"
              name="username"
              autocomplete="username"
              required
              [value]="username()"
              (input)="username.set($any($event.target).value)"
              placeholder="e.g. LXDG"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              autocomplete="current-password"
              required
              [value]="password()"
              (input)="password.set($any($event.target).value)"
            />
          </label>

          <button type="submit" [disabled]="isSubmitting()">
            {{ isSubmitting() ? 'Signing In...' : 'Sign In' }}
          </button>

          @if (errorMessage()) {
            <p class="error">{{ errorMessage() }}</p>
          }
        </form>
      </div>
    </section>
  `,
  styles: `
    .login-shell {
      display: grid;
      place-items: center;
      min-height: 60vh;
    }

    .login-card {
      width: min(92vw, 28rem);
      background: #ffffff;
      border: 1px solid #d8e1ee;
      border-radius: 0.75rem;
      padding: 1.75rem 1.25rem;
      box-shadow: 0 8px 20px rgba(24, 59, 98, 0.08);
    }

    .logo-section {
      display: flex;
      justify-content: center;
      margin-bottom: 1.25rem;
    }

    .brand-mark {
      width: 72px;
      height: 72px;
    }

    .brand-mark svg {
      width: 100%;
      height: 100%;
      display: block;
      border-radius: 8px;
    }

    h2 {
      margin: 0;
      color: #15385f;
      font-size: 1.4rem;
      text-align: center;
    }

    .login-subtitle {
      margin: 0.45rem 0 1rem;
      color: #4a607a;
      text-align: center;
    }

    form {
      display: grid;
      gap: 0.75rem;
    }

    label {
      display: grid;
      gap: 0.35rem;
      color: #334b68;
      font-weight: 600;
    }

    input {
      border: 1px solid #c4d5ea;
      border-radius: 0.45rem;
      padding: 0.55rem 0.6rem;
      font-size: 0.95rem;
      background: #ffffff;
    }

    button {
      border: 1px solid #1f4d85;
      background: #1f4d85;
      color: #ffffff;
      border-radius: 0.5rem;
      padding: 0.6rem 0.9rem;
      font-weight: 700;
      cursor: pointer;
    }

    button[disabled] {
      cursor: not-allowed;
      opacity: 0.75;
    }

    .error {
      margin: 0;
      color: #9c1e1e;
      font-weight: 600;
    }
  `,
})
export class LoginComponent {
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal('');

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    try {
      const result = await this.authService.login(this.username().trim(), this.password());
      if (!result.ok) {
        this.errorMessage.set(result.message || 'Login failed.');
        return;
      }

      this.password.set('');
      await this.router.navigateByUrl('/resource-assignment');
    } catch {
      this.errorMessage.set('Login failed. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
