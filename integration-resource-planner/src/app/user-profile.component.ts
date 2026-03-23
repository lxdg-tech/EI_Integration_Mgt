import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';

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
};

@Component({
  selector: 'app-user-profile',
  imports: [CommonModule],
  template: `
    <main class="user-profile-container">
      <section class="profile-card">
        <h1>User Profile</h1>

        <div class="profile-details" *ngIf="user()">
          <div class="detail-row">
            <label>Display Name:</label>
            <p>{{ user()?.displayName || '(not set)' }}</p>
          </div>

          <div class="detail-row">
            <label>Lan ID:</label>
            <p [class.empty]="!user()?.cn">{{ user()?.cn || '(not set)' }}</p>
          </div>

          <div class="detail-row">
            <label>Email:</label>
            <p [class.empty]="!user()?.email">{{ user()?.email || '(not set)' }}</p>
          </div>

          <div class="detail-row">
            <label>Title:</label>
            <p [class.empty]="!user()?.title">{{ user()?.title || '(not set)' }}</p>
          </div>

          <div class="detail-row">
            <label>Department:</label>
            <p [class.empty]="!user()?.department">{{ user()?.department || '(not set)' }}</p>
          </div>

          <div class="detail-row">
            <label>Phone Number:</label>
            <p [class.empty]="!user()?.telephoneNumber">{{ user()?.telephoneNumber || '(not set)' }}</p>
          </div>

          <div class="detail-row">
            <label>Office Location:</label>
            <p [class.empty]="!user()?.physicalDeliveryOfficeName">{{ user()?.physicalDeliveryOfficeName || '(not set)' }}</p>
          </div>

        </div>

        <div class="no-user" *ngIf="!user()">
          <p>No user information available.</p>
        </div>

        <div class="button-group">
          <button type="button" class="back-btn" (click)="goBack()">
            Back to Planner
          </button>
        </div>
      </section>
    </main>
  `,
  styles: [`
    .user-profile-container {
      padding: 2rem;
      max-width: 700px;
      margin: 0 auto;
    }

    .profile-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    h1 {
      color: #1f90cf;
      margin-bottom: 1.5rem;
      font-size: 1.75rem;
    }

    .detail-row {
      margin-bottom: 1.25rem;
      display: flex;
      flex-direction: column;
    }

    label {
      font-weight: 600;
      color: #333;
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
    }

    p {
      color: #666;
      margin: 0;
      padding: 0.75rem;
      background: #f9f9f9;
      border-radius: 4px;
      border-left: 3px solid #1f90cf;
      word-break: break-word;
    }

    p.empty {
      color: #999;
      font-style: italic;
      border-left-color: #ccc;
    }

    p.small-text {
      font-size: 0.85rem;
      font-family: 'Courier New', monospace;
    }

    .no-user {
      text-align: center;
      color: #999;
      padding: 2rem;
    }

    .button-group {
      margin-top: 2rem;
      display: flex;
      gap: 1rem;
      justify-content: center;
    }

    .back-btn {
      padding: 0.75rem 1.5rem;
      background-color: #1f90cf;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .back-btn:hover {
      background-color: #1678b0;
    }
  `]
})
export class UserProfileComponent implements OnInit {
  user: () => AuthUser | null;

  constructor(private authService: AuthService) {
    this.user = () => this.authService.currentUser();
  }

  ngOnInit(): void {
    // Component initialized
  }

  goBack(): void {
    window.history.back();
  }
}
