import { apiRequest } from '@/lib/queryClient';

export interface FormSubmission {
  id: number;
  formId: number;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const submitForm = async (formId: number, data: Record<string, any>): Promise<FormSubmission> => {
  return apiRequest('/api/enhanced-forms/submissions', {
    method: 'POST',
    body: { formId, data }
  });
};

export const getSubmissions = async (formId: number): Promise<FormSubmission[]> => {
  return apiRequest('/api/enhanced-forms/submissions', {
    params: { formId }
  });
};

export const getSubmission = async (id: number): Promise<FormSubmission> => {
  return apiRequest(`/api/enhanced-forms/submissions/${id}`);
};

export const updateSubmission = async (id: number, data: Record<string, any>): Promise<FormSubmission> => {
  return apiRequest(`/api/enhanced-forms/submissions/${id}`, {
    method: 'PUT',
    body: { data }
  });
};

export const deleteSubmission = async (id: number): Promise<void> => {
  return apiRequest(`/api/enhanced-forms/submissions/${id}`, {
    method: 'DELETE'
  });
};