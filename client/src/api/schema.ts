import { apiRequest } from '@/lib/queryClient';

export interface DatabaseTable {
  name: string;
  label: string;
  description?: string;
}

export interface DatabaseColumn {
  name: string;
  label: string;
  type: string;
  nullable: boolean;
}

export const getTables = async (params?: {
  category?: number;
}): Promise<{ tables: DatabaseTable[] }> => {
  const url = params?.category
    ? `/api/enhanced-forms/schema?category=${params.category}`
    : '/api/enhanced-forms/schema';
  return apiRequest(url);
};

export const getColumns = async (
  tableName: string
): Promise<{ columns: DatabaseColumn[] }> => {
  return apiRequest(`/api/enhanced-forms/schema/${tableName}/columns`);
};
