import { apiRequest } from '@/lib/queryClient';

export interface FormElement {
  id: string;
  type: 'text' | 'input' | 'signature' | 'column' | 'repeat' | 'dropdown' | 'textarea' | 'checkbox';
  x: number;
  y: number;
  width: number;
  height: number;
  config: {
    label?: string;
    required?: boolean;
    visibleIf?: string;
    table?: string;
    column?: string;
    text?: string;
    placeholder?: string;
    options?: string[];
    key?: string;
  };
}

export interface EnhancedForm {
  id: number;
  name: string;
  description?: string;
  categoryId?: number;
  tableName?: string;
  layout: FormElement[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormVersion {
  id: number;
  formId: number;
  version: number;
  layout: FormElement[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FormSubmission {
  id: number;
  formId: number;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const getForms = async (): Promise<EnhancedForm[]> => {
  return apiRequest('/api/enhanced-forms');
};

export const getForm = async (id: number): Promise<EnhancedForm> => {
  return apiRequest(`/api/enhanced-forms/${id}`);
};

export const createForm = async (data: {
  name: string;
  description?: string;
  categoryId?: number;
  tableName?: string;
  layout: FormElement[];
}): Promise<EnhancedForm> => {
  return apiRequest('/api/enhanced-forms', {
    method: 'POST',
    body: data
  });
};

export const updateForm = async (id: number, data: {
  name?: string;
  description?: string;
  categoryId?: number;
  tableName?: string;
  layout?: FormElement[];
}): Promise<EnhancedForm> => {
  return apiRequest(`/api/enhanced-forms/${id}`, {
    method: 'PUT',
    body: data
  });
};

export const deleteForm = async (id: number): Promise<void> => {
  return apiRequest(`/api/enhanced-forms/${id}`, {
    method: 'DELETE'
  });
};

export const getFormVersions = async (formId: number): Promise<FormVersion[]> => {
  return apiRequest(`/api/enhanced-forms/${formId}/versions`);
};

export const getFormVersion = async (formId: number, version: number): Promise<FormVersion> => {
  return apiRequest(`/api/enhanced-forms/${formId}/versions/${version}`);
};

export const submitForm = async (formId: number, data: Record<string, any>): Promise<FormSubmission> => {
  return apiRequest('/api/enhanced-forms/submissions', {
    method: 'POST',
    body: { formId, data }
  });
};

export const getFormSubmissions = async (formId: number): Promise<FormSubmission[]> => {
  return apiRequest('/api/enhanced-forms/submissions', {
    params: { formId }
  });
};