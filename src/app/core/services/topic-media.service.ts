import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { GoogleDriveService, DriveUploadResult } from './google-drive.service';

export interface TopicMedia {
    id: string;
    drive_file_id: string;
    file_name: string;
    mime_type: string;
    created_at: string;
}

@Injectable({ providedIn: 'root' })
export class TopicMediaService {
    uploading = signal(false);

    constructor(private drive: GoogleDriveService) { }

    async getMedia(topicId: string): Promise<TopicMedia[]> {
        const { data, error } = await supabase
            .from('topic_media')
            .select('id, drive_file_id, file_name, mime_type, created_at')
            .eq('topic_id', topicId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data ?? [];
    }

    async upload(
        file: File,
        topicId: string,
        topicTitle: string,       // ← add this
        subjectId: string,
        subjectName: string,
        userId: string
    ): Promise<TopicMedia> {
        this.uploading.set(true);
        try {
            const driveResult = await this.drive.uploadFile(file, subjectName, topicTitle);  // ← pass it

            const { data, error } = await supabase
                .from('topic_media')
                .insert({
                    user_id: userId,
                    topic_id: topicId,
                    subject_id: subjectId,
                    drive_file_id: driveResult.fileId,
                    file_name: driveResult.fileName,
                    mime_type: driveResult.mimeType
                })
                .select('id, drive_file_id, file_name, mime_type, created_at')
                .single();

            if (error) throw error;
            return data;
        } finally {
            this.uploading.set(false);
        }
    }

    async delete(mediaId: string, driveFileId: string): Promise<void> {
        // Delete from Drive first
        try {
            await this.drive.deleteFile(driveFileId);
        } catch {
            // If Drive delete fails, still remove from Supabase
        }

        // Then remove from Supabase
        const { error } = await supabase
            .from('topic_media')
            .delete()
            .eq('id', mediaId);
        if (error) throw error;
    }
}