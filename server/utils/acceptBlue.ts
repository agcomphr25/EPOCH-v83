import fetch from 'node-fetch';

const isProduction = process.env.NODE_ENV === 'production';
const ACCEPT_BLUE_API_URL = isProduction 
  ? 'https://api.accept.blue/api/v2'
  : 'https://api.sandbox.accept.blue/api/v2';

const apiKey = process.env.ACCEPT_BLUE_API_KEY;
const apiPin = process.env.ACCEPT_BLUE_PIN;

if (!apiKey || !apiPin) {
  console.error(
    'Missing Accept.Blue credentials. Please set ACCEPT_BLUE_API_KEY and ACCEPT_BLUE_PIN'
  );
}

function getAuthHeader(): string {
  const credentials = `${apiKey}:${apiPin}`;
  const base64Credentials = Buffer.from(credentials).toString('base64');
  return `Basic ${base64Credentials}`;
}

export interface AcceptBlueChargeRequest {
  amount: number;
  cardNumber: string;
  expirationDate: string;
  cvv: string;
  orderId: string;
  customerEmail?: string;
  billingAddress: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
  };
}

export interface AcceptBlueResponse {
  success: boolean;
  transactionId?: string;
  referenceNumber?: number;
  authCode?: string;
  avsResult?: string;
  cvvResult?: string;
  responseCode?: string;
  message: string;
  rawResponse?: any;
}

export async function chargeCard(
  request: AcceptBlueChargeRequest
): Promise<AcceptBlueResponse> {
  try {
    if (!apiKey || !apiPin) {
      return {
        success: false,
        message: 'Accept.Blue credentials not configured. Please contact support.',
      };
    }

    console.log(`💳 Processing Accept.Blue charge for order ${request.orderId}, amount: $${request.amount}`);
    console.log(`🌐 Using ${isProduction ? 'PRODUCTION' : 'SANDBOX'} environment`);

    const [expMonth, expYear] = request.expirationDate.split('/');
    const fullExpYear = expYear.length === 2 ? parseInt(`20${expYear}`, 10) : parseInt(expYear, 10);

    const payload = {
      amount: request.amount,
      card: request.cardNumber.replace(/\s/g, ''),
      expiry_month: parseInt(expMonth, 10),
      expiry_year: fullExpYear,
      cvv2: request.cvv,
      name: `${request.billingAddress.firstName} ${request.billingAddress.lastName}`,
      avs_address: request.billingAddress.address,
      avs_zip: request.billingAddress.zip,
      billing_info: {
        first_name: request.billingAddress.firstName,
        last_name: request.billingAddress.lastName,
        street: request.billingAddress.address,
        city: request.billingAddress.city,
        state: request.billingAddress.state,
        zip: request.billingAddress.zip,
        country: request.billingAddress.country || 'US',
      },
      transaction_details: {
        invoice_number: request.orderId,
        description: `Payment for Order ${request.orderId}`,
      },
      customer: request.customerEmail ? {
        email: request.customerEmail,
        send_receipt: false,
      } : undefined,
      capture: true,
    };

    console.log('📤 Sending charge request to Accept.Blue...');

    const response = await fetch(`${ACCEPT_BLUE_API_URL}/transactions/charge`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'EPOCH-ERP/1.0',
      },
      body: JSON.stringify(payload),
    });

    // Handle non-JSON responses (like "Unauthorized")
    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.log('❌ Accept.Blue returned non-JSON response:', responseText);
      return {
        success: false,
        responseCode: '3',
        message: response.status === 401 
          ? 'Payment gateway authentication failed. Please contact support.' 
          : `Payment gateway error: ${responseText}`,
      };
    }
    console.log('📥 Accept.Blue response received:', JSON.stringify(data, null, 2));

    if (data.status === 'Approved' || data.status_code === 'A') {
      console.log(`✅ Charge approved! Reference Number: ${data.reference_number}`);
      return {
        success: true,
        transactionId: data.transaction?.id ? String(data.transaction.id) : undefined,
        referenceNumber: data.reference_number,
        authCode: data.auth_code,
        avsResult: data.avs_result,
        cvvResult: data.cvv2_result,
        responseCode: '1',
        message: 'Transaction approved',
        rawResponse: data,
      };
    } else {
      console.log(`❌ Charge declined: ${data.error_message || data.status || 'Unknown error'}`);
      return {
        success: false,
        transactionId: data.transaction?.id ? String(data.transaction.id) : undefined,
        referenceNumber: data.reference_number,
        responseCode: '2',
        message: data.error_message || data.status || 'Transaction declined',
        rawResponse: data,
      };
    }
  } catch (error) {
    console.error('❌ Accept.Blue charge error:', error);
    return {
      success: false,
      responseCode: '3',
      message: error instanceof Error ? error.message : 'Payment processing failed',
    };
  }
}

export async function voidTransaction(
  referenceNumber: string | number
): Promise<AcceptBlueResponse> {
  try {
    if (!apiKey || !apiPin) {
      return {
        success: false,
        message: 'Accept.Blue credentials not configured.',
      };
    }

    console.log(`🔄 Processing Accept.Blue void for reference number ${referenceNumber}`);
    console.log(`🌐 Using ${isProduction ? 'PRODUCTION' : 'SANDBOX'} environment`);

    const payload = {
      reference_number: typeof referenceNumber === 'string' ? parseInt(referenceNumber, 10) : referenceNumber,
    };

    const response = await fetch(`${ACCEPT_BLUE_API_URL}/transactions/void`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'EPOCH-ERP/1.0',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as any;
    console.log('📥 Accept.Blue void response:', JSON.stringify(data, null, 2));

    if (data.status === 'Approved' || data.status_code === 'A' || response.ok) {
      console.log(`✅ Transaction ${referenceNumber} voided successfully`);
      return {
        success: true,
        transactionId: data.transaction?.id ? String(data.transaction.id) : undefined,
        referenceNumber: data.reference_number,
        message: 'Transaction voided successfully',
        rawResponse: data,
      };
    } else {
      console.log(`❌ Void failed: ${data.error_message || data.status || 'Unknown error'}`);
      return {
        success: false,
        message: data.error_message || data.status || 'Void failed',
        rawResponse: data,
      };
    }
  } catch (error) {
    console.error('❌ Accept.Blue void error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Void processing failed',
    };
  }
}

export async function refundTransaction(
  referenceNumber: string | number,
  amount?: number
): Promise<AcceptBlueResponse> {
  try {
    if (!apiKey || !apiPin) {
      return {
        success: false,
        message: 'Accept.Blue credentials not configured.',
      };
    }

    console.log(`💰 Processing Accept.Blue refund for reference number ${referenceNumber}${amount ? `, amount: $${amount}` : ' (full refund)'}`);
    console.log(`🌐 Using ${isProduction ? 'PRODUCTION' : 'SANDBOX'} environment`);

    const payload: any = {
      reference_number: typeof referenceNumber === 'string' ? parseInt(referenceNumber, 10) : referenceNumber,
    };
    
    if (amount !== undefined) {
      payload.amount = amount;
    }

    const response = await fetch(`${ACCEPT_BLUE_API_URL}/transactions/refund`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'EPOCH-ERP/1.0',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as any;
    console.log('📥 Accept.Blue refund response:', JSON.stringify(data, null, 2));

    if (data.status === 'Approved' || data.status_code === 'A') {
      console.log(`✅ Refund processed! New reference number: ${data.reference_number}`);
      return {
        success: true,
        transactionId: data.transaction?.id ? String(data.transaction.id) : undefined,
        referenceNumber: data.reference_number,
        message: 'Refund processed successfully',
        rawResponse: data,
      };
    } else {
      console.log(`❌ Refund failed: ${data.error_message || data.status || 'Unknown error'}`);
      return {
        success: false,
        message: data.error_message || data.status || 'Refund failed',
        rawResponse: data,
      };
    }
  } catch (error) {
    console.error('❌ Accept.Blue refund error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Refund processing failed',
    };
  }
}

export async function getTransaction(
  referenceNumber: string | number
): Promise<AcceptBlueResponse> {
  try {
    if (!apiKey || !apiPin) {
      return {
        success: false,
        message: 'Accept.Blue credentials not configured.',
      };
    }

    console.log(`🔍 Fetching Accept.Blue transaction ${referenceNumber}`);

    const response = await fetch(`${ACCEPT_BLUE_API_URL}/transactions/${referenceNumber}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Accept': 'application/json',
        'User-Agent': 'EPOCH-ERP/1.0',
      },
    });

    const data = await response.json() as any;

    if (response.ok && data.id) {
      return {
        success: true,
        transactionId: String(data.id),
        referenceNumber: data.reference_number,
        authCode: data.card_details?.auth_code,
        message: data.status_details?.status || 'Transaction found',
        rawResponse: data,
      };
    } else {
      return {
        success: false,
        message: data.error_message || 'Transaction not found',
        rawResponse: data,
      };
    }
  } catch (error) {
    console.error('❌ Accept.Blue get transaction error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to fetch transaction',
    };
  }
}

export function isConfigured(): boolean {
  return !!(apiKey && apiPin);
}
