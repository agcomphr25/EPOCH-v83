import { useState, useEffect } from 'react';

type ContactInfo = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
};

type PageState =
  | { phase: 'loading' }
  | { phase: 'ready'; poNumber: string; vendorName: string; expectedDeliveryDate: string | null; contactInfo: ContactInfo }
  | { phase: 'confirming'; contactInfo: ContactInfo }
  | { phase: 'success'; poNumber: string; vendorName: string; contactInfo: ContactInfo }
  | { phase: 'error'; errorCode: string; message: string; contactInfo: ContactInfo };

function ContactBlock({ info }: { info: ContactInfo }) {
  const hasPhone = Boolean(info.companyPhone);
  const hasEmail = Boolean(info.companyEmail);
  return (
    <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500 text-center">
      {info.companyName && <p className="font-semibold text-gray-600">{info.companyName}</p>}
      {info.companyAddress && <p>{info.companyAddress}</p>}
      {(hasPhone || hasEmail) && (
        <p>
          {hasPhone && (
            <>
              Phone:{' '}
              <a href={`tel:${info.companyPhone.replace(/\D/g, '')}`} className="text-blue-600 hover:underline">
                {info.companyPhone}
              </a>
            </>
          )}
          {hasPhone && hasEmail && ' | '}
          {hasEmail && (
            <>
              Email:{' '}
              <a href={`mailto:${info.companyEmail}`} className="text-blue-600 hover:underline">
                {info.companyEmail}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

const EMPTY_CONTACT: ContactInfo = { companyName: '', companyAddress: '', companyPhone: '', companyEmail: '' };

function errorDetails(errorCode: string): { title: string; body: string } {
  switch (errorCode) {
    case 'TOKEN_ALREADY_USED':
      return {
        title: 'Link Already Used',
        body: 'This confirmation link has already been used — your team has already confirmed this PO.',
      };
    case 'TOKEN_EXPIRED':
      return {
        title: 'Link Expired',
        body: 'This confirmation link has expired — please contact us to request a new link.',
      };
    case 'PO_ALREADY_CONFIRMED':
      return {
        title: 'PO Already Confirmed',
        body: 'This PO has already been confirmed — no further action is needed.',
      };
    case 'TOKEN_NOT_FOUND':
    default:
      return {
        title: 'Invalid Link',
        body: 'This confirmation link is invalid — please check the link in your email or contact us for a new one.',
      };
  }
}

export default function VendorConfirmPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const purpose = params.get('purpose') || 'vendor_po_confirmation';

  const [state, setState] = useState<PageState>({ phase: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({
        phase: 'error',
        errorCode: 'TOKEN_NOT_FOUND',
        message: 'No confirmation token found in this link.',
        contactInfo: EMPTY_CONTACT,
      });
      return;
    }

    async function loadPreview() {
      try {
        const res = await fetch(
          `/api/vendor-pos/confirm/preview?token=${encodeURIComponent(token)}&purpose=${encodeURIComponent(purpose)}`
        );
        const data = await res.json();
        const contactInfo: ContactInfo = data.contactInfo || EMPTY_CONTACT;
        if (data.valid) {
          setState({
            phase: 'ready',
            poNumber: data.poNumber || 'Unknown',
            vendorName: data.vendorName || 'Vendor',
            expectedDeliveryDate: data.expectedDeliveryDate || null,
            contactInfo,
          });
        } else {
          setState({ phase: 'error', errorCode: data.errorCode || 'TOKEN_NOT_FOUND', message: data.error || '', contactInfo });
        }
      } catch {
        setState({ phase: 'error', errorCode: 'TOKEN_NOT_FOUND', message: 'Unable to load confirmation details.', contactInfo: EMPTY_CONTACT });
      }
    }

    loadPreview();
  }, [token, purpose]);

  async function handleConfirm() {
    if (state.phase !== 'ready') return;
    const { contactInfo } = state;
    setState({ phase: 'confirming', contactInfo });
    try {
      const res = await fetch('/api/vendor-pos/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, purpose, action: 'confirm' }),
      });
      const data = await res.json();
      if (data.success) {
        setState({ phase: 'success', poNumber: data.poNumber || 'Unknown', vendorName: data.vendorName || 'Vendor', contactInfo });
      } else {
        setState({ phase: 'error', errorCode: data.errorCode || 'TOKEN_NOT_FOUND', message: data.error || '', contactInfo });
      }
    } catch {
      setState({ phase: 'error', errorCode: 'TOKEN_NOT_FOUND', message: 'Unable to submit confirmation.', contactInfo });
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        {state.phase === 'loading' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading confirmation details…</p>
          </div>
        )}

        {state.phase === 'ready' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-800">Purchase Order Confirmation</h1>
              <p className="text-gray-500 mt-2">Please review the details below and confirm receipt.</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 font-medium">PO Number</span>
                <span className="text-sm font-bold text-gray-800">{state.poNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500 font-medium">Vendor</span>
                <span className="text-sm font-semibold text-gray-700">{state.vendorName}</span>
              </div>
              {state.expectedDeliveryDate && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 font-medium">Requested Delivery</span>
                  <span className="text-sm text-gray-700">
                    {new Date(state.expectedDeliveryDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handleConfirm}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors focus:outline-none focus:ring-4 focus:ring-blue-300"
            >
              Confirm PO Receipt
            </button>

            <p className="text-xs text-gray-400 text-center mt-4">
              By clicking above, you confirm that your company has received this purchase order
              {state.contactInfo.companyName ? ` from ${state.contactInfo.companyName}` : ''}.
            </p>

            <ContactBlock info={state.contactInfo} />
          </>
        )}

        {state.phase === 'confirming' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Submitting confirmation…</p>
          </div>
        )}

        {state.phase === 'success' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-800">Thank You!</h1>
              <p className="text-gray-500 mt-2">Your confirmation has been received.</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6 text-center">
              <p className="text-sm text-green-700">
                <strong>{state.vendorName}</strong> has confirmed receipt of PO{' '}
                <strong>{state.poNumber}</strong>.
              </p>
            </div>

            <p className="text-sm text-gray-500 text-center">
              No further action is required. If you have questions, please contact us below.
            </p>

            <ContactBlock info={state.contactInfo} />
          </>
        )}

        {state.phase === 'error' && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-800">{errorDetails(state.errorCode).title}</h1>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
              <p className="text-sm text-amber-800">{errorDetails(state.errorCode).body}</p>
            </div>

            <p className="text-sm text-gray-500 text-center">
              If you believe this is an error, please contact us and we will assist you.
            </p>

            <ContactBlock info={state.contactInfo} />
          </>
        )}
      </div>
    </div>
  );
}
