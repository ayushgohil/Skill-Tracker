import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PomodoroComponent } from './shared/pomodoro/pomodoro.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PomodoroComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('skilltracker');
}
