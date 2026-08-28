import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { environment } from '../../../environments/environment';

export interface DriveUploadResult {
    fileId: string;
    fileName: string;
    mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleDriveService {

    // ── In-memory token cache ──────────────────────────────────
    // Avoids calling the edge function on every Drive API request.
    // The cached token is cleared on page reload (it's just a variable).
    private cachedAccessToken: string | null = null;
    private tokenExpiresAt = 0; // epoch ms

    // ── Blob URL tracking (prevents memory leaks) ─────────────
    private activeBlobUrls = new Set<string>();

    /**
     * Get a valid Google access token.
     *
     * Strategy (in order):
     *  1. Return the in-memory cached token if it hasn't expired
     *  2. Try session.provider_token (available right after OAuth redirect)
     *  3. Call the google-token edge function to mint a fresh token via refresh token
     */
    async getAccessToken(): Promise<string | null> {
        // 1. Check in-memory cache (with 60s safety margin)
        if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60_000) {
            return this.cachedAccessToken;
        }

        // 2. Try session.provider_token (available immediately after OAuth)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.provider_token) {
            // Verify it's actually valid by testing it
            const valid = await this.verifyToken(session.provider_token);
            if (valid) {
                this.cachedAccessToken = session.provider_token;
                // provider_token from Supabase typically lasts ~1 hour
                this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;
                return this.cachedAccessToken;
            }
        }

        // 3. Call the edge function to get a fresh token via refresh token
        return await this.refreshAccessToken();
    }

    /**
     * Call the google-token edge function to get a fresh access token.
     * The edge function reads the stored refresh token server-side
     * and exchanges it with Google — no secrets on the frontend.
     */
    private async refreshAccessToken(): Promise<string | null> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return null;

            const supabaseUrl = environment.supabaseUrl;
            const res = await fetch(`${supabaseUrl}/functions/v1/google-token`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                console.warn('google-token edge function error:', errBody);

                // If the refresh token was revoked, clear the cache
                if (errBody.code === 'REFRESH_TOKEN_REVOKED') {
                    this.clearCachedToken();
                }
                return null;
            }

            const data = await res.json();
            this.cachedAccessToken = data.access_token;
            this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
            return this.cachedAccessToken;
        } catch (err) {
            console.error('Failed to refresh Google access token:', err);
            return null;
        }
    }

    /** Verify a token is valid by calling Google's API */
    private async verifyToken(token: string): Promise<boolean> {
        try {
            const res = await fetch(
                'https://www.googleapis.com/drive/v3/about?fields=user',
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return res.ok;
        } catch {
            return false;
        }
    }

    /** Clear the in-memory token cache */
    clearCachedToken(): void {
        this.cachedAccessToken = null;
        this.tokenExpiresAt = 0;
    }

    /**
     * Check if user has Drive access.
     * Tries all token sources — if any works, Drive is accessible.
     */
    async hasDriveAccess(): Promise<boolean> {
        const token = await this.getAccessToken();
        return !!token;
    }

    // Find or create a folder by name under a parent
    private async findOrCreateFolder(token: string, name: string, parentId?: string): Promise<string> {
        const q = parentId
            ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
            : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Drive folder search failed: ${res.status}`);
        const data = await res.json();
        if (data.files?.length > 0) return data.files[0].id;

        const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) body.parents = [parentId];

        const create = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!create.ok) throw new Error(`Drive folder creation failed: ${create.status}`);
        const folder = await create.json();
        return folder.id;
    }

    // Upload file → NextLyr SkillTracker / {subjectName} / media
    async uploadFile(
        file: File,
        subjectName: string,
        topicTitle: string,
        onProgress?: (percent: number) => void
    ): Promise<DriveUploadResult> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('NO_DRIVE_ACCESS');

        const rootId = await this.findOrCreateFolder(token, 'NextLyr SkillTracker');
        const subjectFolderId = await this.findOrCreateFolder(token, subjectName, rootId);
        const topicFolderId = await this.findOrCreateFolder(token, topicTitle, subjectFolderId);

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({
            name: file.name,
            parents: [topicFolderId]
        })], { type: 'application/json' }));
        form.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const result = JSON.parse(xhr.responseText);
                    resolve({ fileId: result.id, fileName: result.name, mimeType: result.mimeType });
                } else {
                    const err = JSON.parse(xhr.responseText);
                    reject(new Error(err.error?.message ?? 'Upload failed'));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

            xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType');
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(form);
        });
    }

    // Fetch file as a blob URL for display
    async getFileUrl(fileId: string): Promise<string> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('NO_DRIVE_ACCESS');

        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error('Failed to fetch file');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        this.activeBlobUrls.add(url);
        return url;
    }

    /** Revoke a blob URL to free memory. Call when the file is no longer displayed. */
    revokeFileUrl(url: string): void {
        if (this.activeBlobUrls.has(url)) {
            URL.revokeObjectURL(url);
            this.activeBlobUrls.delete(url);
        }
    }

    /** Revoke all active blob URLs (e.g. on logout or navigation). */
    revokeAllFileUrls(): void {
        this.activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
        this.activeBlobUrls.clear();
    }

    async deleteFile(fileId: string): Promise<void> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('NO_DRIVE_ACCESS');

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok && res.status !== 404) {
            throw new Error(`Failed to delete file: ${res.status}`);
        }
    }
    getDriveViewLink(fileId: string): string {
        return `https://drive.google.com/file/d/${fileId}/view`;
    }

    getDriveDownloadLink(fileId: string): string {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    // ── Backup Methods ─────────────────────────────────────────

    /**
     * Upload JSON backup file to NextLyr SkillTracker/Backups folder
     */
    async uploadJsonBackup(fileName: string, jsonContent: string): Promise<DriveUploadResult> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('NO_DRIVE_ACCESS');

        const rootId = await this.findOrCreateFolder(token, 'NextLyr SkillTracker');
        const backupFolderId = await this.findOrCreateFolder(token, 'Backups', rootId);

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({
            name: fileName,
            parents: [backupFolderId]
        })], { type: 'application/json' }));
        form.append('file', new Blob([jsonContent], { type: 'application/json' }));

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message ?? 'Failed to upload backup to Google Drive');
        }

        const result = await res.json();
        return {
            fileId: result.id,
            fileName: result.name,
            mimeType: result.mimeType
        };
    }

    /**
     * List all JSON backup files inside NextLyr SkillTracker/Backups folder
     */
    async listBackupFiles(): Promise<any[]> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('NO_DRIVE_ACCESS');

        const rootId = await this.findOrCreateFolder(token, 'NextLyr SkillTracker');
        const backupFolderId = await this.findOrCreateFolder(token, 'Backups', rootId);

        // Query files inside the Backups folder without strict mimeType restriction
        const q = `'${backupFolderId}' in parents and trashed=false`;
        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,createdTime,size,modifiedTime)&orderBy=createdTime desc`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        let files: any[] = [];
        if (res.ok) {
            const data = await res.json();
            files = data.files ?? [];
        }

        // Fallback: if no files found inside specific folder, search by filename prefix
        if (files.length === 0) {
            const fallbackQuery = `name contains 'skilltracker-backup' and trashed=false`;
            const fallbackRes = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fallbackQuery)}&fields=files(id,name,mimeType,createdTime,size,modifiedTime)&orderBy=createdTime desc`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (fallbackRes.ok) {
                const fallbackData = await fallbackRes.json();
                files = fallbackData.files ?? [];
            }
        }

        return files;
    }

    /**
     * Download and read the raw JSON content of a Drive file
     */
    async getJsonFileContent(fileId: string): Promise<string> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('NO_DRIVE_ACCESS');

        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) throw new Error(`Failed to download backup file from Drive (${res.status})`);
        return await res.text();
    }
}
