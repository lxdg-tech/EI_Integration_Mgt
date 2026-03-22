import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('Integration Resource Planner');
  protected readonly isLoginRoute = signal(false);

  constructor(
    protected readonly authService: AuthService,
    private readonly router: Router
  ) {
    this.setLoginRouteFlag(this.router.url);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.setLoginRouteFlag(event.urlAfterRedirects);
      });
  }

  protected currentUser() {
    return this.authService.currentUser();
  }

  protected async logout(): Promise<void> {
    this.authService.logout();
    await this.router.navigateByUrl('/login');
  }

  private setLoginRouteFlag(url: string): void {
    this.isLoginRoute.set(url.startsWith('/login'));
  }
}
