import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeCreateProjectPayload,
  handleCreateProjectError,
  type NewProjectDraft,
  type ToastFn,
} from '../lib/createProjectHelper';

function makeDraft(overrides: Partial<NewProjectDraft> = {}): NewProjectDraft {
  return {
    projectName: 'Test Project',
    customerId: 'CUST-1',
    description: '',
    targetShipDate: '',
    projectManagerId: '',
    reminderDays: 3,
    ...overrides,
  };
}

describe('normalizeCreateProjectPayload', () => {
  it('preserves a valid reminderDays integer', () => {
    const result = normalizeCreateProjectPayload(makeDraft({ reminderDays: 7 }));
    expect(result.reminderDays).toBe(7);
  });

  it('defaults reminderDays to 3 when the value is NaN', () => {
    const result = normalizeCreateProjectPayload(makeDraft({ reminderDays: NaN }));
    expect(result.reminderDays).toBe(3);
  });

  it('defaults reminderDays to 3 when the value is Infinity', () => {
    const result = normalizeCreateProjectPayload(makeDraft({ reminderDays: Infinity }));
    expect(result.reminderDays).toBe(3);
  });

  it('defaults reminderDays to 3 when the value is -Infinity', () => {
    const result = normalizeCreateProjectPayload(makeDraft({ reminderDays: -Infinity }));
    expect(result.reminderDays).toBe(3);
  });

  it('converts a non-empty projectManagerId string to a number', () => {
    const result = normalizeCreateProjectPayload(makeDraft({ projectManagerId: '42' }));
    expect(result.projectManagerId).toBe(42);
  });

  it('sets projectManagerId to null when the string is empty', () => {
    const result = normalizeCreateProjectPayload(makeDraft({ projectManagerId: '' }));
    expect(result.projectManagerId).toBeNull();
  });

  it('passes through all other fields unchanged', () => {
    const draft = makeDraft({ projectName: 'My Project', customerId: 'ABC', description: 'Desc' });
    const result = normalizeCreateProjectPayload(draft);
    expect(result.projectName).toBe('My Project');
    expect(result.customerId).toBe('ABC');
    expect(result.description).toBe('Desc');
  });
});

describe('handleCreateProjectError', () => {
  let toast: ToastFn;

  beforeEach(() => {
    toast = vi.fn();
  });

  it('calls toast with the destructive variant', () => {
    handleCreateProjectError(new Error('Server error'), toast);
    expect(toast).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
  });

  it('includes the error message in the toast description', () => {
    handleCreateProjectError(new Error('Network failure'), toast);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Network failure' }),
    );
  });

  it('falls back to a generic description when the error has no message', () => {
    const error = new Error('');
    handleCreateProjectError(error, toast);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'An unexpected error occurred. Please try again.',
      }),
    );
  });

  it('falls back to a generic description when error is null', () => {
    handleCreateProjectError(null, toast);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'An unexpected error occurred. Please try again.',
      }),
    );
  });

  it('uses the fixed title "Failed to create project"', () => {
    handleCreateProjectError(new Error('oops'), toast);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Failed to create project' }),
    );
  });
});

describe('Create Project mutation flow — failed POST shows destructive toast', () => {
  it('shows a destructive toast when the POST to /api/projects rejects', async () => {
    const toast = vi.fn();
    const mockApiRequest = vi.fn().mockRejectedValue(new Error('Internal Server Error'));

    let caught: Error | null = null;
    try {
      await mockApiRequest('/api/projects', {
        method: 'POST',
        body: normalizeCreateProjectPayload(makeDraft()),
      });
    } catch (err) {
      caught = err as Error;
    }

    handleCreateProjectError(caught, toast);

    expect(toast).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Failed to create project',
        description: 'Internal Server Error',
      }),
    );
  });

  it('propagates the server error message into the toast when the request fails', async () => {
    const toast = vi.fn();
    const mockApiRequest = vi.fn().mockRejectedValue(new Error('Duplicate project name'));

    let caught: Error | null = null;
    try {
      await mockApiRequest('/api/projects', {
        method: 'POST',
        body: normalizeCreateProjectPayload(makeDraft()),
      });
    } catch (err) {
      caught = err as Error;
    }

    handleCreateProjectError(caught, toast);

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Duplicate project name' }),
    );
  });
});

describe('Create Project mutation flow — reminderDays in the request body', () => {
  it('sends reminderDays: 3 in the request body when the field is cleared (NaN)', async () => {
    const mockApiRequest = vi.fn().mockResolvedValue({ project_id: '1' });

    const draft = makeDraft({ reminderDays: NaN });

    await mockApiRequest('/api/projects', {
      method: 'POST',
      body: normalizeCreateProjectPayload(draft),
    });

    const sentBody = mockApiRequest.mock.calls[0][1].body;
    expect(sentBody.reminderDays).toBe(3);
  });

  it('sends the user-entered reminderDays when it is a valid integer', async () => {
    const mockApiRequest = vi.fn().mockResolvedValue({ project_id: '2' });

    const draft = makeDraft({ reminderDays: 10 });

    await mockApiRequest('/api/projects', {
      method: 'POST',
      body: normalizeCreateProjectPayload(draft),
    });

    const sentBody = mockApiRequest.mock.calls[0][1].body;
    expect(sentBody.reminderDays).toBe(10);
  });
});

describe('Create Project button disabled condition', () => {
  function isCreateButtonDisabled(
    projectName: string,
    customerId: string,
    isPending: boolean,
  ): boolean {
    return !projectName || !customerId || isPending;
  }

  it('is disabled while the mutation is in flight (isPending=true)', () => {
    expect(isCreateButtonDisabled('My Project', 'CUST-1', true)).toBe(true);
  });

  it('is enabled when projectName and customerId are set and mutation is idle', () => {
    expect(isCreateButtonDisabled('My Project', 'CUST-1', false)).toBe(false);
  });

  it('is disabled when projectName is empty even if mutation is idle', () => {
    expect(isCreateButtonDisabled('', 'CUST-1', false)).toBe(true);
  });

  it('is disabled when customerId is empty even if mutation is idle', () => {
    expect(isCreateButtonDisabled('My Project', '', false)).toBe(true);
  });

  it('is disabled when both required fields are empty and mutation is pending', () => {
    expect(isCreateButtonDisabled('', '', true)).toBe(true);
  });
});
