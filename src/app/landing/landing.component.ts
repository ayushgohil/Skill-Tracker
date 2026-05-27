// src/app/landing/landing.component.ts
import { Component, signal, afterNextRender } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-landing',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './landing.component.html'
})
export class LandingComponent {
    isMenuOpen = signal(false);

    constructor() {
        afterNextRender(() => {
            // Heatmap cells generation
            const makeCells = (container: Element, cols: number, rows: number) => {
                const colors = [
                    'rgba(124,58,237,.06)',
                    'rgba(124,58,237,.2)',
                    'rgba(124,58,237,.4)',
                    'rgba(124,58,237,.65)',
                    'rgba(124,58,237,.9)',
                ];
                const weights = [.3, .25, .22, .14, .09];
                const total = cols * rows;
                for (let i = 0; i < total; i++) {
                    const r = Math.random();
                    let cum = 0, level = 0;
                    for (let w = 0; w < weights.length; w++) {
                        cum += weights[w];
                        if (r < cum) { level = w; break; }
                    }
                    const cell = document.createElement('div');
                    cell.style.cssText = `background:${colors[level]};border-radius:2px;`;
                    container.appendChild(cell);
                }
            };

            document.querySelectorAll('.fmh-inner').forEach(g => {
                makeCells(g, 28, 4);
            });

            // Dynamic Premium Animations Decorator & Scroll Reveal System
            // 1. Stagger lists and grid items dynamically
            const staggerSelectors = [
                { parent: '.features-grid', child: '.feat-card-new', delay: 120, direction: 'reveal-up' },
                { parent: '.stats-grid', child: '.stat-card-new', delay: 120, direction: 'reveal-up' },
                { parent: '.bv-grid', child: '.bv-card', delay: 120, direction: 'reveal-up' },
                { parent: '.benefits-list', child: '.benefit-item', delay: 120, direction: 'reveal-right' }
            ];

            staggerSelectors.forEach(group => {
                const container = document.querySelector(group.parent);
                if (container) {
                    const items = container.querySelectorAll(group.child);
                    items.forEach((item, index) => {
                        item.classList.add('reveal-item', group.direction);
                        item.setAttribute('data-delay', (index * group.delay).toString());
                    });
                }
            });

            // Stagger steps-row children (cards + arrows)
            const stepsRow = document.querySelector('.steps-row');
            if (stepsRow) {
                const items = stepsRow.children;
                Array.from(items).forEach((item, index) => {
                    item.classList.add('reveal-item', 'reveal-up');
                    item.setAttribute('data-delay', (index * 100).toString());
                });
            }

            // Headings and section introductions
            document.querySelectorAll('.section-badge, .section-heading, .section-subtext').forEach(el => {
                el.classList.add('reveal-item', 'reveal-up');
            });

            // Specific visuals
            const benefitsVisual = document.querySelector('.benefits-visual');
            if (benefitsVisual) {
                benefitsVisual.classList.add('reveal-item', 'reveal-left');
            }

            const ctaVisual = document.querySelector('.cta-person-wrap');
            if (ctaVisual) {
                ctaVisual.classList.add('reveal-item', 'reveal-right');
            }

            // Stagger Hero elements
            const heroElements = [
                '.hero-badge',
                '.hero-heading',
                '.hero-subtext',
                '.hero-actions',
                '.hero-trust',
                '.hero-image-wrap'
            ];
            heroElements.forEach((selector, index) => {
                const el = document.querySelector(selector);
                if (el) {
                    el.classList.add('hero-reveal', selector.includes('image') ? 'reveal-right' : 'reveal-up');
                    el.setAttribute('data-delay', (index * 100).toString());
                }
            });

            // 2. IntersectionObserver setup
            const observerOptions = {
                threshold: 0.05,
                rootMargin: '0px 0px -50px 0px'
            };

            const scrollObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const el = entry.target;
                        const delay = el.getAttribute('data-delay') || '0';
                        setTimeout(() => {
                            el.classList.add('revealed');
                        }, parseInt(delay));
                        scrollObserver.unobserve(el);
                    }
                });
            }, observerOptions);

            document.querySelectorAll('.reveal-item').forEach(el => {
                scrollObserver.observe(el);
            });

            // 3. Trigger hero load animations
            document.querySelectorAll('.hero-reveal').forEach(el => {
                const delay = el.getAttribute('data-delay') || '0';
                setTimeout(() => {
                    el.classList.add('revealed');
                }, parseInt(delay));
            });

            // Navbar scroll shrink effect
            const navBar = document.querySelector('.nav-bar');
            if (navBar) {
                window.addEventListener('scroll', () => {
                    if (window.scrollY > 20) {
                        navBar.classList.add('nav-scrolled');
                    } else {
                        navBar.classList.remove('nav-scrolled');
                    }
                });
            }
        });
    }

    toggleMenu() {
        this.isMenuOpen.update(v => !v);
        this.updateBodyScroll();
    }

    closeMenu() {
        this.isMenuOpen.set(false);
        this.updateBodyScroll();
    }

    private updateBodyScroll() {
        if (typeof document !== 'undefined') {
            document.body.style.overflow = this.isMenuOpen() ? 'hidden' : '';
        }
    }
}
