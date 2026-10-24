import { ApplicationConfig } from '@angular/core';
import { TitleStrategy, provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideQuillConfig } from 'ngx-quill/config';
import { routes } from './app.routes';
import { AppTitleStrategy } from './core/services/title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })
    ),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideAnimationsAsync(),
    provideQuillConfig({
      modules: {
        magicUrl: true,
        syntax: true,
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          ['code-block'],
          [{ 'color': [] }, { 'background': [] }],
          ['clean'],
          ['link']
        ]
      }
    })
  ]
};