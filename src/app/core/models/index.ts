
export interface Profile {
    id: string;
    display_name: string;
    created_at: string;
}

export interface Subject {
    id: string;
    user_id: string;
    name: string;
    color: string;
    order?: number;
    created_at: string;
    // joined
    topics?: TopicWithProgress[];
}

export type Depth = 'shallow' | 'medium' | 'deep';

export interface Topic {
    id: string;
    user_id: string;
    subject_id: string;
    title: string;
    depth: Depth;
    starred: boolean;
    order?: number;
    created_at: string;
}


export interface UserProgress {
    id?: string;
    user_id: string;
    topic_id: string;
    completed: boolean;
    notes: string;
    updated_at?: string;
}

export interface Subtopic {
    id: string;
    user_id: string;
    topic_id: string;
    title: string;
    completed: boolean;
    notes: string;
    order: number;
    created_at: string;
}

export interface TopicWithProgress extends Topic {
    completed: boolean;
    notes: string;
    subtopics: Subtopic[];
}

export interface SubjectWithTopics extends Subject {
    topics: TopicWithProgress[];
    completedCount: number;
    totalCount: number;
    percent: number;
}

export interface WeeklyGoal {
    id: string;
    user_id: string;
    topic_id: string;
    week_start: string;
    created_at: string;
}

export interface WeeklyReview {
    id: string;
    user_id: string;
    week_start: string;
    completed_at: string;
}

export interface StarredTopic extends TopicWithProgress {
    subject_name: string;
    subject_color: string;
}

export interface ActivityLogItem {
    id?: string;
    user_id?: string;
    date: string;
    tasks_completed: number;
    created_at?: string;
    updated_at?: string;
}

export interface TopicMediaItem {
    id?: string;
    user_id?: string;
    topic_id: string;
    subject_id: string;
    drive_file_id: string;
    file_name: string;
    mime_type: string;
    created_at?: string;
}

export interface BackupMetadata {
    version: number;
    appName: string;
    exportedAt: string;
    userId: string;
    userEmail?: string;
    summary: {
        totalSubjects: number;
        totalTopics: number;
        totalSubtopics: number;
        totalProgressRecords: number;
        totalWeeklyGoals: number;
        totalWeeklyReviews: number;
        totalActivityLogs: number;
        totalMediaAttachments: number;
    };
}

export interface BackupData {
    metadata: BackupMetadata;
    profile?: Partial<Profile>;
    subjects: Subject[];
    topics: Topic[];
    subtopics: Subtopic[];
    user_progress: UserProgress[];
    weekly_goals: WeeklyGoal[];
    weekly_reviews: WeeklyReview[];
    activity_logs: ActivityLogItem[];
    topic_media: TopicMediaItem[];
}

export interface DriveBackupFile {
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    size?: string;
    modifiedTime?: string;
}

export interface RestoreResult {
    success: boolean;
    subjectsRestored: number;
    topicsRestored: number;
    subtopicsRestored: number;
    progressRestored: number;
    message?: string;
}

export type BackupStepStatus = 'pending' | 'active' | 'done' | 'error';

export interface BackupStep {
    id: string;
    label: string;
    status: BackupStepStatus;
}