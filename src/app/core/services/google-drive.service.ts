import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';

export interface DriveUploadResult {
    fileId: string;
    fileName: string;
    mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleDriveService {

    // Get provider_token from active Supabase session
    async getAccessToken(): Promise<string | null> {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.provider_token ?? null;
    }

    // Check if user has Drive access
    async hasDriveAccess(): Promise<boolean> {
        const token = await this.getAccessToken();
        if (!token) return false;

        // Actually verify the token has drive.file scope
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

    // Find or create a folder by name under a parent
    private async findOrCreateFolder(token: string, name: string, parentId?: string): Promise<string> {
        const q = parentId
            ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
            : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.files?.length > 0) return data.files[0].id;

        const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) body.parents = [parentId];

        const create = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const folder = await create.json();
        return folder.id;
    }

    // Upload file → NextLyr SkillTracker / {subjectName} / media
    async uploadFile(file: File, subjectName: string, topicTitle: string): Promise<DriveUploadResult> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('NO_DRIVE_ACCESS');

        const rootId = await this.findOrCreateFolder(token, 'NextLyr SkillTracker');
        const subjectId = await this.findOrCreateFolder(token, subjectName, rootId);
        const topicId = await this.findOrCreateFolder(token, topicTitle, subjectId);  // ← topic folder, no media subfolder

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({
            name: file.name,
            parents: [topicId]
        })], { type: 'application/json' }));
        form.append('file', file);

        const upload = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType',
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form
            }
        );

        if (!upload.ok) {
            const err = await upload.json();
            throw new Error(err.error?.message ?? 'Upload failed');
        }

        const result = await upload.json();
        return { fileId: result.id, fileName: result.name, mimeType: result.mimeType };
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
        return URL.createObjectURL(blob);
    }
    async deleteFile(fileId: string): Promise<void> {
        const token = await this.getAccessToken();
        if (!token) throw new Error('NO_DRIVE_ACCESS');

        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
    }
}