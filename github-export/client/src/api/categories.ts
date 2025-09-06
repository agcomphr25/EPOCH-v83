import { apiRequest } from '@/lib/queryClient';

export interface Category {
  id: number;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const getCategories = async (): Promise<Category[]> => {
  return apiRequest('/api/enhanced-forms/categories');
};

export const createCategory = async (data: { name: string; description?: string }): Promise<Category> => {
  return apiRequest('/api/enhanced-forms/categories', {
    method: 'POST',
    body: data
  });
};

export const updateCategory = async (id: number, data: { name: string; description?: string }): Promise<Category> => {
  return apiRequest(`/api/enhanced-forms/categories/${id}`, {
    method: 'PUT',
    body: data
  });
};

export const deleteCategory = async (id: number): Promise<void> => {
  return apiRequest(`/api/enhanced-forms/categories/${id}`, {
    method: 'DELETE'
  });
};