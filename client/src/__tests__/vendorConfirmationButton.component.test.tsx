/**
 * Component tests for VendorConfirmationCardContent.
 *
 * Verifies that the "Send Confirmation Link" button is rendered when no
 * confirmation link exists (found = false / undefined), and that the
 * "Resend Link" button is rendered when the PO is awaiting confirmation.
 * Both tests also confirm that clicking the button invokes the onResend
 * handler, locking in the handleOpenResendDialog click path.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { VendorConfirmationCardContent } from '../components/inventory/VendorPOManager';

describe('VendorConfirmationCardContent', () => {
  describe('when confirmationStatus is undefined (not yet loaded / not found)', () => {
    it('renders the "Send Confirmation Link" button', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={undefined}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(
        screen.getByTestId('button-send-confirmation-link'),
      ).toBeInTheDocument();
    });

    it('button label reads "Send Confirmation Link"', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={undefined}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(screen.getByTestId('button-send-confirmation-link')).toHaveTextContent(
        'Send Confirmation Link',
      );
    });

    it('clicking the button calls onResend (handleOpenResendDialog path)', () => {
      const onResend = vi.fn();
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={undefined}
          isPending={false}
          onResend={onResend}
        />,
      );
      fireEvent.click(screen.getByTestId('button-send-confirmation-link'));
      expect(onResend).toHaveBeenCalledOnce();
    });
  });

  describe('when confirmationStatus.found is false', () => {
    it('renders the "Send Confirmation Link" button', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={{ found: false }}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(
        screen.getByTestId('button-send-confirmation-link'),
      ).toBeInTheDocument();
    });

    it('clicking the button calls onResend', () => {
      const onResend = vi.fn();
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={{ found: false }}
          isPending={false}
          onResend={onResend}
        />,
      );
      fireEvent.click(screen.getByTestId('button-send-confirmation-link'));
      expect(onResend).toHaveBeenCalledOnce();
    });

    it('shows the "no confirmation link" explanatory text', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={{ found: false }}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(
        screen.getByText(/no confirmation link on record/i),
      ).toBeInTheDocument();
    });
  });

  describe('when confirmationStatus is awaiting confirmation (found, no usedAt)', () => {
    const awaitingStatus = {
      found: true,
      email: 'vendor@example.com',
      usedAt: null,
      expiresAt: null,
    };

    it('renders the "Resend Link" button', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={awaitingStatus}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(
        screen.getByTestId('button-resend-confirmation-link'),
      ).toBeInTheDocument();
    });

    it('button label reads "Resend Link"', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={awaitingStatus}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(screen.getByTestId('button-resend-confirmation-link')).toHaveTextContent(
        'Resend Link',
      );
    });

    it('clicking the button calls onResend (handleOpenResendDialog path)', () => {
      const onResend = vi.fn();
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={awaitingStatus}
          isPending={false}
          onResend={onResend}
        />,
      );
      fireEvent.click(screen.getByTestId('button-resend-confirmation-link'));
      expect(onResend).toHaveBeenCalledOnce();
    });

    it('shows "Awaiting confirmation" text', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={awaitingStatus}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(screen.getByText(/awaiting confirmation/i)).toBeInTheDocument();
    });

    it('shows the vendor email address', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={awaitingStatus}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(screen.getByText('vendor@example.com')).toBeInTheDocument();
    });
  });

  describe('expiry date styling in the awaiting confirmation state', () => {
    it('applies red styling to the expiry date when the link has expired', () => {
      const expiredStatus = {
        found: true,
        email: 'vendor@example.com',
        usedAt: null,
        expiresAt: '2000-01-01T00:00:00Z',
      };
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={expiredStatus}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      const expirySpan = screen.getByText(/expired on/i);
      expect(expirySpan).toBeInTheDocument();
      expect(expirySpan).toHaveClass('text-red-600');
    });

    it('does not apply red styling when the link has not yet expired', () => {
      const futureStatus = {
        found: true,
        email: 'vendor@example.com',
        usedAt: null,
        expiresAt: '2099-01-01T00:00:00Z',
      };
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={futureStatus}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      const expiryDiv = screen.getByText(/link expires/i);
      const expirySpan = expiryDiv.querySelector('span') as HTMLElement;
      expect(expirySpan).not.toHaveClass('text-red-600');
      expect(expirySpan).toHaveClass('text-foreground');
    });
  });

  describe('loading state', () => {
    it('does not render either button while loading', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={true}
          confirmationStatus={undefined}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(
        screen.queryByTestId('button-send-confirmation-link'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('button-resend-confirmation-link'),
      ).not.toBeInTheDocument();
    });

    it('shows loading text while loading', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={true}
          confirmationStatus={undefined}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(
        screen.getByText(/loading confirmation status/i),
      ).toBeInTheDocument();
    });
  });

  describe('confirmed state', () => {
    it('does not render either button when already confirmed', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={{
            found: true,
            email: 'vendor@example.com',
            usedAt: '2024-01-15T10:00:00Z',
            expiresAt: null,
          }}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(
        screen.queryByTestId('button-send-confirmation-link'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('button-resend-confirmation-link'),
      ).not.toBeInTheDocument();
    });

    it('shows "Confirmed on" text when usedAt is present', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={{
            found: true,
            email: 'vendor@example.com',
            usedAt: '2024-01-15T10:00:00Z',
            expiresAt: null,
          }}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(screen.getByText(/confirmed on/i)).toBeInTheDocument();
    });

    it('shows the vendor email address in the confirmed state', () => {
      render(
        <VendorConfirmationCardContent
          isLoading={false}
          confirmationStatus={{
            found: true,
            email: 'vendor@example.com',
            usedAt: '2024-01-15T10:00:00Z',
            expiresAt: null,
          }}
          isPending={false}
          onResend={vi.fn()}
        />,
      );
      expect(screen.getByText('vendor@example.com')).toBeInTheDocument();
    });
  });
});
