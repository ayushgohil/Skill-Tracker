// src/app/core/models/index.ts

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