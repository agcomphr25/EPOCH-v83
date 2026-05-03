/**
 * Component tests for SignBadgeScanSection.
 *
 * Verifies dialog-level behavior:
 * - Scanning a recognized badge populates the Full Name field (auto-fill via handler)
 * - The green confirmation card appears on a successful badge lookup
 * - The red "not recognized" message appears and the Full Name field stays editable
 *   when the badge is unknown
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import SignBadgeScanSection from '../components/SignBadgeScanSection';

const MOCK_EMPLOYEE = {
  id: 7,
  name: 'Jane Smith',
  employeeCode: 'JS007',
  department: 'Quality',
};

function renderSection(props: Partial<Parameters<typeof SignBadgeScanSection>[0]> = {}) {
  const defaults = {
    badgeValue: '',
    signedByName: '',
    lookupStatus: 'idle' as const,
    resolvedEmployee: null,
    onBadgeChange: vi.fn(),
    onNameChange: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  return render(<SignBadgeScanSection {...merged} />);
}

describe('SignBadgeScanSection — idle state', () => {
  it('renders the badge input field', () => {
    renderSection();
    expect(screen.getByTestId('input-sign-badge')).toBeInTheDocument();
  });

  it('does not show the green confirmation card in idle state', () => {
    renderSection();
    expect(screen.queryByTestId('sign-badge-found-card')).not.toBeInTheDocument();
  });

  it('does not show the not-found error message in idle state', () => {
    renderSection();
    expect(screen.queryByTestId('sign-badge-not-found-message')).not.toBeInTheDocument();
  });

  it('does not show the Full Name manual-entry field in idle state', () => {
    renderSection();
    expect(screen.queryByTestId('input-sign-name')).not.toBeInTheDocument();
  });
});

describe('SignBadgeScanSection — recognized badge (found status)', () => {
  it('shows the green confirmation card', () => {
    renderSection({
      lookupStatus: 'found',
      resolvedEmployee: MOCK_EMPLOYEE,
    });
    expect(screen.getByTestId('sign-badge-found-card')).toBeInTheDocument();
  });

  it('displays the employee name inside the green confirmation card', () => {
    renderSection({
      lookupStatus: 'found',
      resolvedEmployee: MOCK_EMPLOYEE,
    });
    expect(screen.getByTestId('sign-badge-found-card')).toHaveTextContent('Jane Smith');
  });

  it('displays the employee code inside the green confirmation card', () => {
    renderSection({
      lookupStatus: 'found',
      resolvedEmployee: MOCK_EMPLOYEE,
    });
    expect(screen.getByTestId('sign-badge-found-card')).toHaveTextContent('JS007');
  });

  it('displays the department inside the green confirmation card', () => {
    renderSection({
      lookupStatus: 'found',
      resolvedEmployee: MOCK_EMPLOYEE,
    });
    expect(screen.getByTestId('sign-badge-found-card')).toHaveTextContent('Quality');
  });

  it('does NOT show the not-found error when badge is recognized', () => {
    renderSection({
      lookupStatus: 'found',
      resolvedEmployee: MOCK_EMPLOYEE,
    });
    expect(screen.queryByTestId('sign-badge-not-found-message')).not.toBeInTheDocument();
  });

  it('does NOT show the manual Full Name input when badge is recognized', () => {
    renderSection({
      lookupStatus: 'found',
      resolvedEmployee: MOCK_EMPLOYEE,
    });
    expect(screen.queryByTestId('input-sign-name')).not.toBeInTheDocument();
  });

  it('reflects the auto-filled name in the badge input via badgeValue prop', () => {
    renderSection({
      lookupStatus: 'found',
      resolvedEmployee: MOCK_EMPLOYEE,
      badgeValue: 'BADGE001',
    });
    expect(screen.getByTestId('input-sign-badge')).toHaveValue('BADGE001');
  });
});

describe('SignBadgeScanSection — unrecognized badge (not_found status)', () => {
  it('shows the red "not recognized" error message', () => {
    renderSection({ lookupStatus: 'not_found' });
    expect(screen.getByTestId('sign-badge-not-found-message')).toBeInTheDocument();
    expect(screen.getByTestId('sign-badge-not-found-message')).toHaveTextContent(
      'Badge not found',
    );
  });

  it('renders the Full Name manual-entry field when badge is unknown', () => {
    renderSection({ lookupStatus: 'not_found' });
    expect(screen.getByTestId('input-sign-name')).toBeInTheDocument();
  });

  it('Full Name field is editable — typing calls onNameChange', () => {
    const onNameChange = vi.fn();
    renderSection({ lookupStatus: 'not_found', onNameChange });

    fireEvent.change(screen.getByTestId('input-sign-name'), {
      target: { value: 'John Doe' },
    });

    expect(onNameChange).toHaveBeenCalledWith('John Doe');
  });

  it('Full Name field reflects the current signedByName value', () => {
    renderSection({ lookupStatus: 'not_found', signedByName: 'John Doe' });
    expect(screen.getByTestId('input-sign-name')).toHaveValue('John Doe');
  });

  it('does NOT show the green confirmation card when badge is unknown', () => {
    renderSection({ lookupStatus: 'not_found' });
    expect(screen.queryByTestId('sign-badge-found-card')).not.toBeInTheDocument();
  });
});

describe('SignBadgeScanSection — badge input interaction', () => {
  it('calls onBadgeChange when the badge input value changes', () => {
    const onBadgeChange = vi.fn();
    renderSection({ onBadgeChange });

    fireEvent.change(screen.getByTestId('input-sign-badge'), {
      target: { value: 'SCAN1234' },
    });

    expect(onBadgeChange).toHaveBeenCalledWith('SCAN1234');
  });
});

describe('SignBadgeScanSection — end-to-end badge scan via runSignBadgeLookup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the green confirmation card and auto-fills the name after a successful badge scan', async () => {
    const { runSignBadgeLookup: lookup } = await import('../lib/signBadgeHandlers');

    let state = {
      badgeValue: '',
      signedByName: '',
      lookupStatus: 'idle' as 'idle' | 'loading' | 'found' | 'not_found',
      resolvedEmployee: null as typeof MOCK_EMPLOYEE | null,
    };

    const resolveBadge = vi.fn().mockResolvedValue({ ok: true, employee: MOCK_EMPLOYEE });

    const { rerender } = render(
      <SignBadgeScanSection
        badgeValue={state.badgeValue}
        signedByName={state.signedByName}
        lookupStatus={state.lookupStatus}
        resolvedEmployee={state.resolvedEmployee}
        onBadgeChange={vi.fn()}
        onNameChange={vi.fn()}
      />,
    );

    await act(async () => {
      await lookup('BADGE001', {
        resolveBadge,
        setSignedByName: (name) => { state = { ...state, signedByName: name }; },
        setSignResolvedEmployee: (emp) => { state = { ...state, resolvedEmployee: emp }; },
        setSignBadgeLookupStatus: (s) => { state = { ...state, lookupStatus: s }; },
      });
    });

    rerender(
      <SignBadgeScanSection
        badgeValue={state.badgeValue}
        signedByName={state.signedByName}
        lookupStatus={state.lookupStatus}
        resolvedEmployee={state.resolvedEmployee}
        onBadgeChange={vi.fn()}
        onNameChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('sign-badge-found-card')).toBeInTheDocument();
    expect(screen.getByTestId('sign-badge-found-card')).toHaveTextContent('Jane Smith');
    expect(state.signedByName).toBe('Jane Smith');
    expect(state.resolvedEmployee).toEqual(MOCK_EMPLOYEE);
  });

  it('shows the red not-found message and leaves Full Name editable when badge is unrecognized', async () => {
    const { runSignBadgeLookup: lookup } = await import('../lib/signBadgeHandlers');

    let state = {
      badgeValue: '',
      signedByName: '',
      lookupStatus: 'idle' as 'idle' | 'loading' | 'found' | 'not_found',
      resolvedEmployee: null as typeof MOCK_EMPLOYEE | null,
    };

    const resolveBadge = vi.fn().mockResolvedValue({ ok: false });

    const { rerender } = render(
      <SignBadgeScanSection
        badgeValue={state.badgeValue}
        signedByName={state.signedByName}
        lookupStatus={state.lookupStatus}
        resolvedEmployee={state.resolvedEmployee}
        onBadgeChange={vi.fn()}
        onNameChange={vi.fn()}
      />,
    );

    await act(async () => {
      await lookup('UNKNOWN1', {
        resolveBadge,
        setSignedByName: (name) => { state = { ...state, signedByName: name }; },
        setSignResolvedEmployee: (emp) => { state = { ...state, resolvedEmployee: emp }; },
        setSignBadgeLookupStatus: (s) => { state = { ...state, lookupStatus: s }; },
      });
    });

    rerender(
      <SignBadgeScanSection
        badgeValue={state.badgeValue}
        signedByName={state.signedByName}
        lookupStatus={state.lookupStatus}
        resolvedEmployee={state.resolvedEmployee}
        onBadgeChange={vi.fn()}
        onNameChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('sign-badge-not-found-message')).toBeInTheDocument();
    expect(screen.getByTestId('input-sign-name')).toBeInTheDocument();
    expect(state.signedByName).toBe('');
    expect(state.resolvedEmployee).toBeNull();
  });
});
