# Integration Resource Planner: User Role vs Page Access Matrix

## Roles

- Admin
- Resource Manager
- Practitioner
- Unauthenticated User

## Page Access Matrix

| App Page | Route | Admin | Resource Manager | Practitioner | Unauthenticated User |
|---|---|---|---|---|---|
| Login | /login | Yes | Yes | Yes | Yes |
| User Profile | /user-profile | Yes | Yes | Yes | No |
| Admin | /admin | Yes | No | No | No |
| Resource Assignment | /resource-assignment | Yes | Yes | No | No |
| Deliverable Management | /deliverable-management | Yes | Yes | Yes | No |
| Daily Operating Review | /daily-operating-review | Yes | Yes | Yes | No |
| Resource Forecast | /resource-forecast | Yes | Yes | Yes | No |

## Notes

- Access is enforced by route guards and authentication checks.
- Any unknown route redirects to /login.
- Navigation buttons are shown only when the user has permission for each page.
- Admin link in the top bar is visible only to Admin users.
