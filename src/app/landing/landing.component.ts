// src/app/landing/landing.component.ts
import { Component, signal, afterNextRender, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-landing',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './landing.component.html'
})
export class LandingComponent implements OnDestroy {
    isMenuOpen = signal(false);
    private _cursorCleanup?: () => void;

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

            // Cursor Follower — elements created dynamically on first mouse move
            this._cursorCleanup = this.initCursorFollower();
        });
    }

    /**
     * Creates cursor dot + ring dynamically. Nothing exists in the DOM until the
     * user actually moves their mouse, so there's zero chance of a flash at (0,0).
     */
    private initCursorFollower(): () => void {
        // Skip on touch devices
        if (window.matchMedia('(hover: none)').matches) {
            return () => {};
        }

        let dot: HTMLElement | null = null;
        let ring: HTMLElement | null = null;
        let created = false;

        const createElements = (x: number, y: number) => {
            // Inject styles once
            const style = document.createElement('style');
            style.id = 'cursor-follower-styles';
            style.textContent = `
                .cf-dot, .cf-ring {
                    position: fixed;
                    border-radius: 50%;
                    pointer-events: none;
                    z-index: 99999;
                    transform: translate(-50%, -50%);
                }
                .cf-dot {
                    width: 7px;
                    height: 7px;
                    background: #f59e0b;
                    box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
                    transition: opacity 0.3s ease;
                }
                .cf-ring {
                    width: 34px;
                    height: 34px;
                    border: 2.5px solid rgba(245, 158, 11, 0.55);
                    background: transparent;
                    transition: left 0.12s ease-out, top 0.12s ease-out, opacity 0.3s ease;
                }
            `;
            document.head.appendChild(style);

            // Create dot
            dot = document.createElement('div');
            dot.className = 'cf-dot';
            dot.style.left = x + 'px';
            dot.style.top = y + 'px';
            document.body.appendChild(dot);

            // Create ring — already at correct position, no transition needed
            ring = document.createElement('div');
            ring.className = 'cf-ring';
            ring.style.transition = 'none';
            ring.style.left = x + 'px';
            ring.style.top = y + 'px';
            document.body.appendChild(ring);

            // Force reflow then enable transition
            void ring.offsetHeight;
            ring.style.transition = '';

            created = true;
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!created) {
                createElements(e.clientX, e.clientY);
                return;
            }
            if (dot) {
                dot.style.left = e.clientX + 'px';
                dot.style.top = e.clientY + 'px';
            }
            if (ring) {
                ring.style.left = e.clientX + 'px';
                ring.style.top = e.clientY + 'px';
            }
        };

        const onMouseLeave = () => {
            if (dot) dot.style.opacity = '0';
            if (ring) ring.style.opacity = '0';
        };

        const onMouseEnter = (e: MouseEvent) => {
            if (!created) return;
            if (dot) {
                dot.style.left = e.clientX + 'px';
                dot.style.top = e.clientY + 'px';
                dot.style.opacity = '1';
            }
            if (ring) {
                ring.style.transition = 'none';
                ring.style.left = e.clientX + 'px';
                ring.style.top = e.clientY + 'px';
                void ring.offsetHeight;
                ring.style.transition = '';
                ring.style.opacity = '1';
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseleave', onMouseLeave);
        document.addEventListener('mouseenter', onMouseEnter);

        // Return cleanup function
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseleave', onMouseLeave);
            document.removeEventListener('mouseenter', onMouseEnter);
            dot?.remove();
            ring?.remove();
            document.getElementById('cursor-follower-styles')?.remove();
        };
    }

    ngOnDestroy() {
        this._cursorCleanup?.();
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
