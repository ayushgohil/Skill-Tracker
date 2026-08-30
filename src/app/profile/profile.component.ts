import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ProfileService } from '../core/services/profile.service';
import { SubjectsService } from '../core/services/subjects.service';
import { TopicsService } from '../core/services/topics.service';
import { AuthService } from '../core/services/auth.service';
import { ToastService } from '../core/services/toast.service';
import { GoogleDriveService } from '../core/services/google-drive.service';
import { BackupService } from '../core/services/backup.service';
import { ThemeService } from '../core/services/theme.service';
import { AnimationService } from '../core/services/animation.service';
import { Profile, SubjectWithTopics, DriveBackupFile, BackupData } from '../core/models';
import { ActivityHeatmapComponent } from './activity-heatmap/activity-heatmap.component';
import { ToastComponent } from '../shared/toast/toast.component';
import { staggerList, fadeSlideInOut } from '../core/animations/app.animations';
import Swal from 'sweetalert2';

export interface ProgressStep {
    id: string;
    label: string;
    status: 'pending' | 'active' | 'done' | 'error';
}

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, ActivityHeatmapComponent, ToastComponent],
    templateUrl: './profile.component.html',
    animations: [staggerList, fadeSlideInOut]
})
export class ProfileComponent implements OnInit {

    // ── Header Collapse on Scroll ─────────────────────
    headerCollapsed = signal(false);

    @HostListener('window:scroll', [])
    onWindowScroll() {
        if (typeof window !== 'undefined') {
            this.headerCollapsed.set(window.scrollY > 80);
        }
    }

    profile = signal<Profile | null>(null);
    loading = signal(true);
    saving = signal(false);
    displayName = '';
    editingName = signal(false);
    totalTopics = signal(0);
    totalCompleted = signal(0);
    totalSubjects = signal(0);

    // ── Animated Metrics ──────────────────────────────
    displayedSubjects = signal(0);
    displayedTopics = signal(0);
    displayedCompleted = signal(0);
    displayedPercent = signal(0);

    showDeleteModal = signal(false);
    deleteConfirmationEmail = '';
    isDeleting = signal(false);
    deletionProgress = signal<{ table: string, label: string, status: 'pending' | 'deleting' | 'done' | 'error' }[]>([]);
    autoConnectDrive = signal(false);
    hasDriveAccess = signal(false);

    // ── Backup / Export State ────────────────────────────────
    showExportModal = signal(false);
    isExporting = signal(false);
    exportDestination = signal<'drive' | 'download'>('drive');
    exportProgress = signal<ProgressStep[]>([]);
    exportFinished = signal(false);

    // ── Restore / Import State ───────────────────────────────
    showRestoreModal = signal(false);
    isRestoring = signal(false);
    restoreSource = signal<'file' | 'drive'>('file');
    restoreProgress = signal<ProgressStep[]>([]);
    restoreFinished = signal(false);
    driveBackups = signal<DriveBackupFile[]>([]);
    loadingDriveBackups = signal(false);
    selectedDriveBackupId = signal<string>('');
    selectedBackupData = signal<BackupData | null>(null);
    selectedBackupFileName = signal<string>('');

    percent = computed(() =>
        this.totalTopics() ? Math.round((this.totalCompleted() / this.totalTopics()) * 100) : 0
    );
    userEmail = computed(() => this.auth.currentUser()?.email ?? '');
    userAvatar = computed(() => this.auth.currentUser()?.user_metadata?.['avatar_url'] ?? '');
    memberSince = computed(() => {
        const p = this.profile();
        if (!p) return '';
        return new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    });

    joinYear = computed(() => {
        const p = this.profile();
        if (!p) return new Date().getFullYear();
        return new Date(p.created_at).getFullYear();
    });

    constructor(
        private profileService: ProfileService,
        private topicsService: TopicsService,
        private auth: AuthService,
        private toast: ToastService,
        private googleDrive: GoogleDriveService,
        private backupService: BackupService,
        public themeService: ThemeService,
        private anim: AnimationService
    ) { }

    async ngOnInit() {
        this.loading.set(true);
        try {
            const [profile, subjects, autoConnect, driveAccess] = await Promise.all([
                this.profileService.getProfile(),
                this.topicsService.getSubjectsWithTopics(),
                this.auth.getAutoConnectDriveSetting(),
                this.googleDrive.hasDriveAccess()
            ]);
            this.autoConnectDrive.set(autoConnect);
            this.hasDriveAccess.set(driveAccess);
            this.profile.set(profile);
            this.displayName = profile.display_name ?? '';

            const subCount = subjects.length;
            const topCount = subjects.reduce((s: number, c: SubjectWithTopics) => s + c.totalCount, 0);
            const compCount = subjects.reduce((s: number, c: SubjectWithTopics) => s + c.completedCount, 0);
            const pct = topCount ? Math.round((compCount / topCount) * 100) : 0;

            this.totalSubjects.set(subCount);
            this.totalTopics.set(topCount);
            this.totalCompleted.set(compCount);

            // Animate metrics smoothly with GSAP
            this.anim.animateNumber({ value: 0 }, subCount, (v: number) => this.displayedSubjects.set(v), 0.8);
            this.anim.animateNumber({ value: 0 }, topCount, (v: number) => this.displayedTopics.set(v), 1.0);
            this.anim.animateNumber({ value: 0 }, compCount, (v: number) => this.displayedCompleted.set(v), 1.2);
            this.anim.animateNumber({ value: 0 }, pct, (v: number) => this.displayedPercent.set(v), 1.2);
        } catch {
            this.toast.error('Failed to load profile.');
        } finally {
            this.loading.set(false);
        }
    }

    async saveName() {
        if (!this.displayName.trim()) return;
        this.saving.set(true);
        try {
            await this.profileService.updateDisplayName(this.displayName.trim());
            this.profile.update(p => p ? { ...p, display_name: this.displayName.trim() } : p);
            this.editingName.set(false);
            this.toast.success('Display name updated.');
        } catch {
            this.toast.error('Failed to update name.');
        } finally {
            this.saving.set(false);
        }
    }

    async toggleAutoConnectDrive() {
        const newValue = !this.autoConnectDrive();
        await this.auth.setAutoConnectDrive(newValue);
        this.autoConnectDrive.set(newValue);

        if (newValue) {
            const hasRefreshToken = await this.auth.hasStoredRefreshToken();
            if (hasRefreshToken) {
                this.toast.success('Drive will connect automatically on login.');
                this.hasDriveAccess.set(true);
                return;
            }

            const hasAccess = await this.googleDrive.hasDriveAccess();
            this.hasDriveAccess.set(hasAccess);
            if (!hasAccess) {
                this.toast.success('Drive auto-connect enabled. Redirecting to authorize Google Drive...');
                setTimeout(async () => {
                    await this.auth.connectGoogleDrive();
                }, 1200);
                return;
            }
        } else {
            await this.auth.clearStoredRefreshToken();
            this.googleDrive.clearCachedToken();
            this.hasDriveAccess.set(false);
        }

        this.toast.success(newValue
            ? 'Drive will connect automatically on login.'
            : 'Drive disconnected. Auto-connect disabled.'
        );
    }

    async connectDrive() {
        await this.auth.connectGoogleDrive();
    }

    logout() { this.auth.logout(); }


    // ── Backup / Export Logic ────────────────────────────────

    async startExport() {
        const driveAccess = await this.googleDrive.hasDriveAccess();
        this.hasDriveAccess.set(driveAccess);
        this.exportDestination.set(driveAccess ? 'drive' : 'download');
        this.isExporting.set(false);
        this.exportFinished.set(false);
        this.exportProgress.set([]);
        this.showExportModal.set(true);
    }

    selectExportDestination(dest: 'drive' | 'download') {
        if (this.isExporting()) return;
        this.exportDestination.set(dest);
    }

    async confirmAndRunExport() {
        if (this.isExporting()) return;

        const isDrive = this.exportDestination() === 'drive';

        if (isDrive) {
            const hasAccess = await this.googleDrive.hasDriveAccess();
            this.hasDriveAccess.set(hasAccess);

            if (!hasAccess) {
                const result = await Swal.fire({
                    title: 'Google Drive Access Required',
                    html: `
                        <div style="text-align:left; font-size:13px; color:#94a3b8; line-height:1.6">
                            <p style="margin-bottom:10px">NextLyr needs access to save your backup in your Drive folder (<code>NextLyr SkillTracker/Backups</code>).</p>
                            <p>Would you like to authorize Google Drive now or download the backup file instead?</p>
                        </div>
                    `,
                    icon: 'info',
                    showCancelButton: true,
                    showDenyButton: true,
                    confirmButtonText: 'Connect Google Drive',
                    denyButtonText: 'Download File Instead',
                    cancelButtonText: 'Cancel',
                    background: '#0f172a',
                    color: '#f1f5f9',
                    confirmButtonColor: '#2563eb',
                    denyButtonColor: '#4f46e5',
                    cancelButtonColor: '#3f3f46',
                    customClass: { popup: 'swal-dark-popup' }
                });

                if (result.isConfirmed) {
                    await this.auth.connectGoogleDrive();
                    return;
                } else if (result.isDenied) {
                    this.exportDestination.set('download');
                } else {
                    return;
                }
            } else {
                // Confirm dialog for putting data in
                const confirmDrive = await Swal.fire({
                    title: 'Confirm Google Drive Backup',
                    html: `
                        <div style="text-align:left; font-size:13px; color:#94a3b8; line-height:1.6">
                            <p style="margin-bottom:10px">Are you sure you want to put data into your Google Drive?</p>
                            <div style="background:#1e293b; border:1px solid #334155; border-radius:8px; padding:10px; font-size:12px; color:#cbd5e1">
                                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px">
                                    <span style="color:#38bdf8">📁</span> <strong>Folder:</strong> NextLyr SkillTracker / Backups
                                </div>
                                <div style="display:flex; align-items:center; gap:6px">
                                    <span style="color:#34d399">📦</span> <strong>Includes:</strong> All subjects, topics, subtopics, checkmarks, notes, weekly goals & heatmap
                                </div>
                            </div>
                        </div>
                    `,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Yes, Put Data In',
                    cancelButtonText: 'Cancel',
                    background: '#0f172a',
                    color: '#f1f5f9',
                    confirmButtonColor: '#2563eb',
                    cancelButtonColor: '#3f3f46',
                    customClass: { popup: 'swal-dark-popup' }
                });

                if (!confirmDrive.isConfirmed) return;
            }
        }

        this.isExporting.set(true);
        this.exportFinished.set(false);

        const isDriveExport = this.exportDestination() === 'drive';

        const steps: ProgressStep[] = [
            { id: 'extract_entities', label: 'Extracting Subjects, Topics & Subtopics', status: 'pending' },
            { id: 'extract_progress', label: 'Gathering Checkmarks & Notes', status: 'pending' },
            { id: 'extract_weekly', label: 'Collecting Goals & Consistency Heatmap', status: 'pending' },
            { id: 'package_json', label: 'Packaging & Formatting JSON Schema', status: 'pending' },
            {
                id: 'save_dest',
                label: isDriveExport ? 'Uploading to Google Drive (NextLyr SkillTracker/Backups)' : 'Generating & Downloading JSON File',
                status: 'pending'
            }
        ];

        this.exportProgress.set(steps);

        const updateStep = (index: number, status: 'pending' | 'active' | 'done' | 'error') => {
            this.exportProgress.update(prev => {
                const arr = [...prev];
                if (arr[index]) arr[index] = { ...arr[index], status };
                return arr;
            });
        };

        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        try {
            // Step 1: Extract entities
            updateStep(0, 'active');
            await sleep(350);
            const backupData = await this.backupService.exportAllUserData();
            updateStep(0, 'done');

            // Step 2: Checkmarks
            updateStep(1, 'active');
            await sleep(300);
            updateStep(1, 'done');

            // Step 3: Goals & Activity
            updateStep(2, 'active');
            await sleep(300);
            updateStep(2, 'done');

            // Step 4: Packaging
            updateStep(3, 'active');
            await sleep(250);
            updateStep(3, 'done');

            // Step 5: Save
            updateStep(4, 'active');
            if (isDriveExport) {
                await this.backupService.backupToGoogleDrive(backupData);
            } else {
                this.backupService.downloadBackupFile(backupData);
            }
            await sleep(350);
            updateStep(4, 'done');

            this.exportFinished.set(true);
            this.toast.success(isDriveExport
                ? 'Backup saved to Google Drive successfully!'
                : 'Backup JSON downloaded successfully!'
            );

        } catch (err: any) {
            console.error('Export failed:', err);
            this.exportProgress.update(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
            this.toast.error(err.message || 'Failed to export backup.');
        } finally {
            this.isExporting.set(false);
        }
    }

    // ── Restore / Import Logic ───────────────────────────────

    async startRestore() {
        const driveAccess = await this.googleDrive.hasDriveAccess();
        this.hasDriveAccess.set(driveAccess);
        this.restoreSource.set('file');
        this.selectedBackupData.set(null);
        this.selectedBackupFileName.set('');
        this.selectedDriveBackupId.set('');
        this.isRestoring.set(false);
        this.restoreFinished.set(false);
        this.restoreProgress.set([]);
        this.showRestoreModal.set(true);

        if (driveAccess) {
            this.loadDriveBackups();
        }
    }

    async setRestoreSource(source: 'file' | 'drive') {
        this.restoreSource.set(source);
        if (source === 'drive') {
            const driveAccess = await this.googleDrive.hasDriveAccess();
            this.hasDriveAccess.set(driveAccess);
            if (driveAccess) {
                await this.loadDriveBackups();
            }
        }
    }

    async loadDriveBackups() {
        this.loadingDriveBackups.set(true);
        try {
            const files = await this.backupService.listDriveBackups();
            this.driveBackups.set(files);
            if (files.length > 0 && !this.selectedDriveBackupId()) {
                this.onSelectDriveBackup(files[0].id);
            }
        } catch (err) {
            console.error('Failed to list drive backups:', err);
        } finally {
            this.loadingDriveBackups.set(false);
        }
    }


    async onFileSelected(event: any) {
        const file: File = event.target.files?.[0];
        if (!file) return;

        try {
            const data = await this.backupService.parseBackupFile(file);
            this.selectedBackupData.set(data);
            this.selectedBackupFileName.set(file.name);
            this.toast.success(`Backup loaded: ${data.subjects.length} subjects found.`);
        } catch (err: any) {
            this.selectedBackupData.set(null);
            this.selectedBackupFileName.set('');
            this.toast.error(err.message || 'Invalid backup JSON file.');
        }
    }

    async onSelectDriveBackup(fileId: string) {
        if (!fileId) {
            this.selectedBackupData.set(null);
            this.selectedBackupFileName.set('');
            return;
        }

        const found = this.driveBackups().find(f => f.id === fileId);
        this.selectedDriveBackupId.set(fileId);
        this.selectedBackupFileName.set(found?.name || 'Google Drive Backup');

        try {
            this.loadingDriveBackups.set(true);
            const data = await this.backupService.getBackupFromDrive(fileId);
            this.selectedBackupData.set(data);
            //this.toast.success(`Drive backup loaded: ${data.subjects.length} subjects found.`);
        } catch (err: any) {
            this.selectedBackupData.set(null);
            this.toast.error(err.message || 'Failed to download backup from Google Drive.');
        } finally {
            this.loadingDriveBackups.set(false);
        }
    }

    async confirmAndRunRestore() {
        const backupData = this.selectedBackupData();
        if (!backupData || this.isRestoring()) return;

        const confirm = await Swal.fire({
            title: 'Revert & Restore Data?',
            html: `
                <div style="text-align:left; font-size:13px; color:#94a3b8; line-height:1.6">
                    <p style="margin-bottom:12px">
                        This action will <strong style="color:#ef4444">replace all current subjects, topics, checkmarks, and notes</strong> with the contents of this backup.
                    </p>
                    <div style="background:#1e293b; border:1px solid #334155; border-radius:8px; padding:12px; margin-bottom:12px">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; color:#cbd5e1">
                            <div>📚 <strong>Subjects:</strong> ${backupData.subjects.length}</div>
                            <div>📝 <strong>Topics:</strong> ${backupData.topics.length}</div>
                            <div>📌 <strong>Subtopics:</strong> ${backupData.subtopics.length}</div>
                            <div>✅ <strong>Progress items:</strong> ${backupData.user_progress.length}</div>
                        </div>
                    </div>
                    <p style="font-size:12px; color:#f59e0b">⚠️ Are you sure you want to overwrite and revert to this state?</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, Restore Now',
            cancelButtonText: 'Cancel',
            background: '#0f172a',
            color: '#f1f5f9',
            confirmButtonColor: '#2563eb',
            cancelButtonColor: '#3f3f46',
            customClass: { popup: 'swal-dark-popup' }
        });

        if (!confirm.isConfirmed) return;

        this.isRestoring.set(true);
        this.restoreFinished.set(false);

        const steps: ProgressStep[] = [
            { id: 'clear_existing', label: 'Clearing Current Database Records', status: 'pending' },
            { id: 'restore_subjects', label: 'Rebuilding Subjects & Color Themes', status: 'pending' },
            { id: 'restore_topics', label: 'Rebuilding Topics & Depth Levels', status: 'pending' },
            { id: 'restore_subtopics', label: 'Restoring Subtopics & Checkmarks', status: 'pending' },
            { id: 'restore_progress', label: 'Restoring Topic Progress & Notes', status: 'pending' },
            { id: 'restore_weekly', label: 'Restoring Weekly Goals & Reviews', status: 'pending' },
            { id: 'restore_activity', label: 'Synchronizing Heatmap & Consistency', status: 'pending' },
            { id: 'finalize', label: 'Finalizing & Refreshing Workspace', status: 'pending' }
        ];

        this.restoreProgress.set(steps);

        const updateStep = (index: number, status: 'pending' | 'active' | 'done' | 'error') => {
            this.restoreProgress.update(prev => {
                const arr = [...prev];
                if (arr[index]) arr[index] = { ...arr[index], status };
                return arr;
            });
        };

        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        try {
            await this.backupService.restoreData(backupData, (stepIndex) => {
                if (stepIndex > 0) updateStep(stepIndex - 1, 'done');
                updateStep(stepIndex, 'active');
            });

            await sleep(400);
            updateStep(7, 'done');

            this.restoreFinished.set(true);
            this.toast.success('Skill-Tracker restored completely!');

            // Re-fetch profile and stats
            await this.ngOnInit();

        } catch (err: any) {
            console.error('Restore failed:', err);
            this.restoreProgress.update(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
            this.toast.error(err.message || 'Failed to restore backup.');
        } finally {
            this.isRestoring.set(false);
        }
    }

    // ── Delete Account Logic ─────────────────────────────────

    startDeleteAccount() {
        this.deleteConfirmationEmail = '';
        this.deletionProgress.set([
            { table: 'activity_logs', label: 'Activity Logs', status: 'pending' },
            { table: 'weekly_reviews', label: 'Weekly Reviews', status: 'pending' },
            { table: 'weekly_goals', label: 'Weekly Goals', status: 'pending' },
            { table: 'user_progress', label: 'User Progress', status: 'pending' },
            { table: 'subtopics', label: 'Subtopics', status: 'pending' },
            { table: 'topics', label: 'Topics', status: 'pending' },
            { table: 'subjects', label: 'Subjects', status: 'pending' },
            { table: 'profiles', label: 'Profile Data', status: 'pending' }
        ]);
        this.showDeleteModal.set(true);
    }

    async confirmDeleteAccount() {
        if (this.deleteConfirmationEmail !== this.userEmail() || this.isDeleting()) return;

        this.isDeleting.set(true);
        const steps = this.deletionProgress();
        let currentStep = 0;

        const progressInterval = setInterval(() => {
            if (currentStep < steps.length - 1) {
                this.deletionProgress.update(prev => {
                    const arr = [...prev];
                    if (currentStep > 0) arr[currentStep - 1].status = 'done';
                    arr[currentStep].status = 'deleting';
                    return arr;
                });
                currentStep++;
            }
        }, 400);

        try {
            await this.profileService.deleteAccount();

            clearInterval(progressInterval);
            this.deletionProgress.update(prev => prev.map(s => ({ ...s, status: 'done' })));

            this.toast.success('Account data deleted completely.');
            setTimeout(() => this.logout(), 1500);
        } catch (err: any) {
            clearInterval(progressInterval);
            console.error(`Failed to delete account:`, err);

            this.deletionProgress.update(prev => {
                const arr = [...prev];
                arr[currentStep].status = 'error';
                return arr;
            });
            this.toast.error(err.message || 'Error deleting account.');
            this.isDeleting.set(false);
        }
    }
}
