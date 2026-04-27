import { trigger, transition, style, animate, query, stagger, state } from '@angular/animations';

export const fadeSlideInOut = trigger('fadeSlideInOut', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(20px)' }),
    animate('400ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
  ]),
  transition(':leave', [
    animate('300ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 0, transform: 'translateY(20px)' }))
  ])
]);

export const staggerList = trigger('staggerList', [
  transition('* => *', [
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(20px)' }),
      stagger(50, [
        animate('500ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ], { optional: true })
  ])
]);

export const expandCollapse = trigger('expandCollapse', [
  state('collapsed', style({ height: '0px', minHeight: '0', display: 'none' })),
  state('expanded', style({ height: '*' })),
  transition('expanded <=> collapsed', animate('300ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
]);
