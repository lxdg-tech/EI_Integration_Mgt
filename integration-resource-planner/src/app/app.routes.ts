import { Routes } from '@angular/router';
import { DailyOperatingReviewComponent } from './daily-operating-review.component';
import { PlannerPageComponent } from './planner-page.component';
import { DeliverableManagementComponent } from './deliverable-management.component';
import { ResourceManagementComponent } from './resource-management.component';
import { LoginComponent } from './login.component';
import { UserProfileComponent } from './user-profile.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'resource-assignment',
    component: ResourceManagementComponent,
    canActivate: [authGuard],
  },
  {
    path: 'deliverable-management',
    component: DeliverableManagementComponent,
    canActivate: [authGuard],
  },
  {
    path: 'daily-operating-review',
    component: DailyOperatingReviewComponent,
    canActivate: [authGuard],
  },
  {
    path: 'resource-forecast',
    component: PlannerPageComponent,
    data: { title: 'Resource Forecast' },
    canActivate: [authGuard],
  },
  {
    path: 'user-profile',
    component: UserProfileComponent,
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'login' },
];
