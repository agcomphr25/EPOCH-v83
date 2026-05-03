export interface NewProjectDraft {
  projectName: string;
  customerId: string;
  description: string;
  targetShipDate: string;
  projectManagerId: string;
  reminderDays: number;
}

export interface CreateProjectPayload {
  projectName: string;
  customerId: string;
  description: string;
  targetShipDate: string;
  projectManagerId: number | null;
  reminderDays: number;
}

export interface ToastOptions {
  title: string;
  description: string;
  variant: 'destructive' | 'default';
}

export type ToastFn = (opts: ToastOptions) => void;

export function normalizeCreateProjectPayload(data: NewProjectDraft): CreateProjectPayload {
  return {
    ...data,
    reminderDays: Number.isFinite(data.reminderDays) ? data.reminderDays : 3,
    projectManagerId: data.projectManagerId ? parseInt(data.projectManagerId) : null,
  };
}

export function handleCreateProjectError(error: Error | null | undefined, toast: ToastFn): void {
  toast({
    title: 'Failed to create project',
    description: error?.message || 'An unexpected error occurred. Please try again.',
    variant: 'destructive',
  });
}
