import {
    Component, ElementRef, OnDestroy, QueryList, ViewChild, ViewChildren,
    effect, input, output, signal, untracked, inject, PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

interface PageSize {
    width: number;
    height: number;
}

/**
 * Renders a PDF Blob directly onto HTML canvases using PDF.js so PDFs work
 * reliably inside mobile WebViews, PWAs and APKs as well as desktop browsers.
 */
@Component({
    selector: 'app-pdf-viewer',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './pdf-viewer.component.html'
})
export class PdfViewerComponent implements OnDestroy {
    pdfBlob = input.required<Blob>();
    isImmersive = input<boolean>(false);
    toggleImmersive = output<void>();

    @ViewChild('scrollContainer') scrollContainerRef?: ElementRef<HTMLDivElement>;
    @ViewChildren('pageWrapper') pageWrappers?: QueryList<ElementRef<HTMLDivElement>>;
    @ViewChildren('pageCanvas') pageCanvases?: QueryList<ElementRef<HTMLCanvasElement>>;

    private platformId = inject(PLATFORM_ID);

    loading = signal(true);
    error = signal(false);
    totalPages = signal(0);
    currentPage = signal(1);
    zoom = signal(1);
    pages = signal<number[]>([]);
    pageSizes = signal<Record<number, PageSize>>({});

    readonly Math = Math;

    private pdfDoc: any = null;
    private loadGeneration = 0;
    private basePageWidth = 595;
    private basePageHeight = 842;
    private fitScale = 1;
    private renderedPages = new Set<number>();
    private activeRenderTasks = new Map<number, any>();
    private intersectionObserver?: IntersectionObserver;
    private resizeObserver?: ResizeObserver;
    private resizeTimer?: ReturnType<typeof setTimeout>;
    private visibleRatios = new Map<number, number>();
    private lastMeasuredWidth = 0;

    constructor() {
        effect(() => {
            const blob = this.pdfBlob();
            untracked(() => {
                if (isPlatformBrowser(this.platformId) && blob) {
                    void this.loadPdf(blob);
                }
            });
        });
    }

    ngOnDestroy() {
        this.loadGeneration++;
        this.cleanupDocument();
        this.resizeObserver?.disconnect();
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
    }

    private cleanupDocument() {
        this.cancelAllRenderTasks();
        this.renderedPages.clear();
        this.visibleRatios.clear();
        this.intersectionObserver?.disconnect();
        this.intersectionObserver = undefined;
        if (this.pdfDoc) {
            void this.pdfDoc.destroy?.();
            this.pdfDoc = null;
        }
    }

    private cancelAllRenderTasks() {
        this.activeRenderTasks.forEach(task => {
            try { task.cancel?.(); } catch { /* already finished */ }
        });
        this.activeRenderTasks.clear();
    }

    private async loadPdf(blob: Blob) {
        const gen = ++this.loadGeneration;
        this.cleanupDocument();
        this.loading.set(true);
        this.error.set(false);
        this.totalPages.set(0);
        this.currentPage.set(1);
        this.zoom.set(1);
        this.pages.set([]);
        this.pageSizes.set({});

        try {
            const buffer = await blob.arrayBuffer();
            if (gen !== this.loadGeneration) return;

            const pdfjs = await import('pdfjs-dist');
            if (gen !== this.loadGeneration) return;

            if (!pdfjs.GlobalWorkerOptions.workerSrc) {
                pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/pdf.worker.min.mjs', document.baseURI).toString();
            }

            const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
            const doc = await loadingTask.promise;
            if (gen !== this.loadGeneration) {
                void doc.destroy?.();
                return;
            }

            this.pdfDoc = doc;
            const firstPage = await doc.getPage(1);
            if (gen !== this.loadGeneration) return;

            const unscaled = firstPage.getViewport({ scale: 1 });
            this.basePageWidth = unscaled.width || 595;
            this.basePageHeight = unscaled.height || 842;
            this.updateFitScale();

            const pageList = Array.from({ length: doc.numPages }, (_, i) => i + 1);
            this.totalPages.set(doc.numPages);
            this.pages.set(pageList);
            this.loading.set(false);

            setTimeout(() => {
                if (gen !== this.loadGeneration) return;
                this.setupResizeObserver();
                this.updateFitScale();
                this.setupIntersectionObserver();
            }, 0);
        } catch {
            if (gen === this.loadGeneration) {
                this.error.set(true);
                this.loading.set(false);
            }
        }
    }

    private getContainerWidth(): number {
        const containerW = this.scrollContainerRef?.nativeElement.clientWidth ?? 0;
        if (containerW > 0) return containerW;
        return typeof window !== 'undefined' ? window.innerWidth : 375;
    }

    private updateFitScale() {
        const rawWidth = this.getContainerWidth();
        this.lastMeasuredWidth = rawWidth;
        const horizontalGap = rawWidth < 640 ? 8 : 32;
        const targetWidth = Math.max(240, rawWidth - horizontalGap);
        this.fitScale = Math.max(0.25, targetWidth / this.basePageWidth);
    }

    getPageWidth(pageNum: number): number {
        const specific = this.pageSizes()[pageNum];
        if (specific) return specific.width;
        return Math.floor(this.basePageWidth * this.fitScale * this.zoom());
    }

    getPageHeight(pageNum: number): number {
        const specific = this.pageSizes()[pageNum];
        if (specific) return specific.height;
        return Math.floor(this.basePageHeight * this.fitScale * this.zoom());
    }

    private setupResizeObserver() {
        this.resizeObserver?.disconnect();
        const el = this.scrollContainerRef?.nativeElement;
        if (!el || typeof ResizeObserver === 'undefined') return;

        this.resizeObserver = new ResizeObserver(() => {
            const w = el.clientWidth;
            if (w <= 0 || Math.abs(w - this.lastMeasuredWidth) < 4) return;
            if (this.resizeTimer) clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                if (!this.pdfDoc) return;
                this.updateFitScale();
                this.rerenderVisible();
            }, 150);
        });
        this.resizeObserver.observe(el);
    }

    private setupIntersectionObserver() {
        this.intersectionObserver?.disconnect();
        const root = this.scrollContainerRef?.nativeElement ?? null;
        if (!root || typeof IntersectionObserver === 'undefined') {
            // Fallback for environments without IntersectionObserver
            this.pages().slice(0, 5).forEach(p => void this.renderPage(p));
            return;
        }

        this.intersectionObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const pageNum = Number((entry.target as HTMLElement).dataset['page']);
                    if (!pageNum) continue;

                    if (entry.isIntersecting) {
                        this.visibleRatios.set(pageNum, entry.intersectionRatio);
                        void this.renderPage(pageNum);
                    } else {
                        this.visibleRatios.delete(pageNum);
                    }
                }
                this.updateCurrentPageFromVisible();
            },
            {
                root,
                rootMargin: '500px 0px',
                threshold: [0, 0.25, 0.5, 0.75, 1]
            }
        );

        this.pageWrappers?.forEach(w => this.intersectionObserver!.observe(w.nativeElement));
    }

    private updateCurrentPageFromVisible() {
        if (this.visibleRatios.size === 0) return;
        let bestPage = this.currentPage();
        let bestRatio = -1;
        this.visibleRatios.forEach((ratio, page) => {
            if (ratio > bestRatio || (ratio === bestRatio && page < bestPage)) {
                bestRatio = ratio;
                bestPage = page;
            }
        });
        if (bestPage !== this.currentPage()) {
            this.currentPage.set(bestPage);
            this.pruneDistantPages(bestPage);
        }
    }

    private pruneDistantPages(centerPage: number) {
        if (this.totalPages() <= 16) return;
        const maxDistance = 8;
        for (const pageNum of Array.from(this.renderedPages)) {
            if (Math.abs(pageNum - centerPage) > maxDistance) {
                const canvas = this.findCanvas(pageNum);
                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                }
                this.renderedPages.delete(pageNum);
            }
        }
    }

    private findCanvas(pageNum: number): HTMLCanvasElement | undefined {
        return this.pageCanvases?.find(c => Number(c.nativeElement.dataset['page']) === pageNum)?.nativeElement;
    }

    private async renderPage(pageNum: number) {
        const gen = this.loadGeneration;
        if (!this.pdfDoc || this.renderedPages.has(pageNum)) return;

        const canvas = this.findCanvas(pageNum);
        if (!canvas) return;

        const existingTask = this.activeRenderTasks.get(pageNum);
        if (existingTask) {
            try { existingTask.cancel?.(); } catch { /* ignore */ }
            this.activeRenderTasks.delete(pageNum);
        }

        this.renderedPages.add(pageNum);

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            if (gen !== this.loadGeneration) return;

            const cssScale = this.fitScale * this.zoom();
            const dpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 2.5);
            const cssViewport = page.getViewport({ scale: cssScale });
            const renderViewport = page.getViewport({ scale: cssScale * dpr });

            const cssW = Math.floor(cssViewport.width);
            const cssH = Math.floor(cssViewport.height);
            this.pageSizes.update(sizes => ({
                ...sizes,
                [pageNum]: { width: cssW, height: cssH }
            }));

            canvas.width = Math.floor(renderViewport.width);
            canvas.height = Math.floor(renderViewport.height);
            canvas.style.width = `${cssW}px`;
            canvas.style.height = `${cssH}px`;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                this.renderedPages.delete(pageNum);
                return;
            }

            const renderTask = page.render({
                canvasContext: ctx,
                canvas,
                viewport: renderViewport
            } as any);
            this.activeRenderTasks.set(pageNum, renderTask);

            await renderTask.promise;
            this.activeRenderTasks.delete(pageNum);
        } catch (err: any) {
            this.activeRenderTasks.delete(pageNum);
            this.renderedPages.delete(pageNum);
            if (err?.name !== 'RenderingCancelledException') {
                console.warn(`PDF page ${pageNum} render error:`, err);
            }
        }
    }

    private rerenderVisible() {
        this.cancelAllRenderTasks();
        this.renderedPages.clear();
        this.pageSizes.set({});
        this.setupIntersectionObserver();
    }

    zoomIn() {
        this.setZoom(Math.min(3, +(this.zoom() + 0.25).toFixed(2)));
    }

    zoomOut() {
        this.setZoom(Math.max(0.5, +(this.zoom() - 0.25).toFixed(2)));
    }

    resetZoom() {
        this.setZoom(1);
    }

    private setZoom(next: number) {
        if (next === this.zoom()) return;
        this.zoom.set(next);
        this.rerenderVisible();
    }

    prevPage() {
        this.scrollToPage(Math.max(1, this.currentPage() - 1));
    }

    nextPage() {
        this.scrollToPage(Math.min(this.totalPages(), this.currentPage() + 1));
    }

    scrollToPage(pageNum: number) {
        const wrapper = this.pageWrappers?.find(w => Number(w.nativeElement.dataset['page']) === pageNum)?.nativeElement;
        if (wrapper) {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            this.currentPage.set(pageNum);
        }
    }
}
