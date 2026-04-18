// src/app/core/services/categories.service.ts
import { Injectable } from '@angular/core';
import { supabase } from '../supabase.client';
import { Category } from '../models';

@Injectable({ providedIn: 'root' })
export class CategoriesService {

    async getAll(): Promise<Category[]> {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data as Category[];
    }

    async create(name: string, color: string): Promise<Category> {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('categories')
            .insert({ name, color, user_id: user!.id })
            .select()
            .single();
        if (error) throw error;
        return data as Category;
    }

    async update(id: string, name: string, color: string): Promise<void> {
        const { error } = await supabase
            .from('categories')
            .update({ name, color })
            .eq('id', id);
        if (error) throw error;
    }

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
}