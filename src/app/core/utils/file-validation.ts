export interface FileValidationResult {
    valid: boolean;
    error?: string;
}

const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/** Makes a file name safe to put inside a popup that shows HTML. */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * How an attachment may be shown inside the app.
 *  image / video : shown with a normal image or video tag
 *  pdf           : shown in the PDF viewer
 *  text          : the words are read and shown as plain text (never run as a page)
 *  none          : no preview, only Download / Open in Drive
 */
export type PreviewKind = 'image' | 'video' | 'pdf' | 'text' | 'none';

export function previewKind(mime: string | null | undefined): PreviewKind {
    const m = (mime ?? '').toLowerCase();
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m === 'application/pdf') return 'pdf';
    if (m === 'text/plain' || m === 'text/csv' || m === 'text/markdown') return 'text';
    return 'none';
}

// All allowed MIME types
const ALLOWED_TYPES: Record<string, string> = {
    // Images
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/bmp': 'BMP',
    'image/tiff': 'TIFF',
    // Videos
    'video/mp4': 'MP4',
    'video/webm': 'WebM',
    'video/ogg': 'OGG Video',
    'video/quicktime': 'MOV',
    'video/x-msvideo': 'AVI',
    'video/x-matroska': 'MKV',
    // Documents
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.ms-powerpoint': 'PPT',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    // Text
    'text/plain': 'TXT',
    'text/csv': 'CSV',
    'text/markdown': 'MD',
    // Archives
    'application/zip': 'ZIP',
    'application/x-rar-compressed': 'RAR',
    'application/x-7z-compressed': '7Z',
    // Audio
    'audio/mpeg': 'MP3',
    'audio/wav': 'WAV',
    'audio/ogg': 'OGG Audio',
    'audio/mp4': 'M4A',
};

export function validateFile(file: File): FileValidationResult {
    // Size check
    if (file.size > MAX_SIZE_BYTES) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        return {
            valid: false,
            error: `<b>${escapeHtml(file.name)}</b> is ${fileSizeMB}MB — maximum allowed size is ${MAX_SIZE_MB}MB.`
        };
    }

    // Type check
    if (!ALLOWED_TYPES[file.type]) {
        return {
            valid: false,
            error: `<b>${escapeHtml(file.name)}</b> has an unsupported file type (<code>${escapeHtml(file.type || 'unknown')}</code>).`
        };
    }

    return { valid: true };
}

export function validateFiles(files: File[]): {
    valid: File[];
    errors: string[];
} {
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
        const result = validateFile(file);
        if (result.valid) {
            valid.push(file);
        } else {
            errors.push(result.error!);
        }
    }

    return { valid, errors };
}