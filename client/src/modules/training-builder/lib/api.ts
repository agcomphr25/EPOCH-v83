export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPatch<T>(path: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(path, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text());
}

export interface TrainingProgram {
  id: number;
  title: string;
  department: string;
  role: string;
  description?: string;
  tasks: ProgramTask[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgramTask {
  id: number;
  programId: number;
  title: string;
  description?: string;
  order: number;
  estimatedMinutes?: number;
}

export interface ProgramAssignment {
  id: number;
  programId: number;
  employeeId: number;
  assignedBy: number;
  startDate: string;
  dueDate?: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: string;
}

export interface TrainingSession {
  id: number;
  assignmentId: number;
  employeeId: number;
  programId: number;
  status: 'active' | 'completed';
  startedAt: string;
  completedAt?: string;
}

export interface TrainingMatrixEntry {
  employeeId: number;
  employeeName: string;
  department: string;
  programs: {
    programId: number;
    programTitle: string;
    status: string;
    completedAt?: string;
  }[];
}

export interface CreateProgramInput {
  title: string;
  department: string;
  role: string;
  description?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  sortOrder?: number;
  estimatedMinutes?: number;
}

export interface CreateAssignmentInput {
  programId: number;
  employeeId: number;
  assignedBy: number;
  startDate?: string;
  dueDate?: string;
}

export const trainingBuilderApi = {
  async getPrograms(): Promise<TrainingProgram[]> {
    return apiGet('/api/training/programs');
  },

  async getProgram(id: number): Promise<TrainingProgram> {
    return apiGet(`/api/training/programs/${id}`);
  },

  async createProgram(data: CreateProgramInput): Promise<TrainingProgram> {
    return apiPost('/api/training/programs', data);
  },

  async updateProgram(id: number, data: Partial<CreateProgramInput>): Promise<TrainingProgram> {
    return apiPatch(`/api/training/programs/${id}`, data);
  },

  async deleteProgram(id: number): Promise<void> {
    return apiDelete(`/api/training/programs/${id}`);
  },

  async addTask(programId: number, task: CreateTaskInput): Promise<ProgramTask> {
    return apiPost(`/api/training/programs/${programId}/tasks`, task);
  },

  async createAssignment(data: CreateAssignmentInput): Promise<ProgramAssignment> {
    return apiPost('/api/training/assignments', data);
  },

  async getSession(sessionId: string): Promise<TrainingSession> {
    return apiGet(`/api/training/sessions/${sessionId}`);
  },

  async signoffSession(sessionId: string, signoffData: { supervisorId: number; notes?: string }): Promise<void> {
    return apiPost(`/api/training/sessions/${sessionId}/signoff`, signoffData);
  },

  async completeSession(sessionId: string): Promise<void> {
    return apiPost(`/api/training/sessions/${sessionId}/complete`, {});
  },

  async getMatrix(): Promise<TrainingMatrixEntry[]> {
    return apiGet('/api/training/matrix');
  },
};

export const QUERY_KEYS = {
  programs: ['/api/training/programs'] as const,
  program: (id: number) => ['/api/training/programs', id] as const,
  assignments: ['/api/training/assignments'] as const,
  session: (sessionId: string) => ['/api/training/sessions', sessionId] as const,
  matrix: ['/api/training/matrix'] as const,
};
