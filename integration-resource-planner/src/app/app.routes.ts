import { Routes } from '@angular/router';
import { DailyOperatingReviewComponent } from './daily-operating-review.component';
import { PlannerPageComponent } from './planner-page.component';
import { DeliverableManagementComponent } from './deliverable-management.component';
import { ResourceManagementComponent } from './resource-management.component';
import { LoginComponent } from './login.component';
import { UserProfileComponent } from './user-profile.component';
import { AdministrateUsersComponent } from './administrate-users.component';
import { UploadTimeReportComponent } from './upload-time-report.component';
import { authGuard, adminGuard, resourceManagerGuard, practitionerOrManagerGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'resource-assignment',
    component: ResourceManagementComponent,
    canActivate: [resourceManagerGuard],
  },
  {
    path: 'deliverable-management',
    component: DeliverableManagementComponent,
    canActivate: [practitionerOrManagerGuard],
  },
  {
    path: 'daily-operating-review',
    component: DailyOperatingReviewComponent,
    canActivate: [practitionerOrManagerGuard],
  },
  {
    path: 'resource-forecast',
    component: PlannerPageComponent,
    data: { title: 'Resource Forecast' },
    canActivate: [practitionerOrManagerGuard],
  },
  {
    path: 'user-profile',
    component: UserProfileComponent,
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    component: AdministrateUsersComponent,
    canActivate: [adminGuard],
  },
  {
    path: 'upload-time-report',
    component: UploadTimeReportComponent,
    canActivate: [adminGuard],
  },
  { path: '**', redirectTo: 'login' },
];
