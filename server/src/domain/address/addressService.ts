import type { AddressInput, DomainAddress, ValidationResult } from './types';

const STATE_ABBREVIATIONS: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  'puerto rico': 'PR', 'guam': 'GU', 'virgin islands': 'VI',
  'american samoa': 'AS', 'northern mariana islands': 'MP',
};

const COUNTRY_MAP: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'us': 'US',
  'canada': 'CA',
  'mexico': 'MX',
};

function normalizeState(state: string): string {
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const abbr = STATE_ABBREVIATIONS[trimmed.toLowerCase()];
  return abbr || trimmed.toUpperCase();
}

function normalizeCountry(country?: string): string {
  if (!country) return 'US';
  const trimmed = country.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const mapped = COUNTRY_MAP[trimmed.toLowerCase()];
  return mapped || trimmed.toUpperCase();
}

function normalizePostalCode(zip: string): string {
  const digitsOnly = zip.replace(/[^0-9]/g, '');
  if (digitsOnly.length === 9) {
    return `${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5)}`;
  }
  if (digitsOnly.length >= 5) {
    return digitsOnly.slice(0, 5);
  }
  return zip.trim();
}

export function normalizeInput(address: AddressInput): AddressInput {
  return {
    street1: address.street1.trim(),
    street2: address.street2?.trim() || undefined,
    city: address.city.trim(),
    state: normalizeState(address.state),
    postalCode: normalizePostalCode(address.postalCode),
    countryCode: normalizeCountry(address.countryCode),
  };
}

export async function validateWithSmarty(address: AddressInput): Promise<DomainAddress> {
  const authId = process.env.SMARTYSTREETS_AUTH_ID;
  const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;

  if (!authId || !authToken) {
    console.warn('⚠️ SmartyStreets credentials not configured — skipping validation');
    return {
      street1: address.street1,
      street2: address.street2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      countryCode: address.countryCode || 'US',
      status: 'raw',
    };
  }

  const smartyUrl = `https://us-street.api.smartystreets.com/street-address?auth-id=${authId}&auth-token=${authToken}`;

  const requestBody = [
    {
      street: address.street1,
      street2: address.street2 || '',
      city: address.city,
      state: address.state,
      zipcode: address.postalCode,
      candidates: 1,
    },
  ];

  try {
    const response = await fetch(smartyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error(`Smarty API error: ${response.status} ${response.statusText}`);
      return {
        street1: address.street1,
        street2: address.street2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        countryCode: address.countryCode || 'US',
        status: 'invalid',
      };
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return {
        street1: address.street1,
        street2: address.street2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        countryCode: address.countryCode || 'US',
        status: 'invalid',
      };
    }

    const result = data[0];
    const components = result.components || {};
    const metadata = result.metadata || {};
    const dpvMatchCode = metadata.dpv_match_code || '';

    const plus4 = components.plus4_code;
    const baseZip = components.zipcode || address.postalCode;
    const fullZip = plus4 ? `${baseZip}-${plus4}` : baseZip;

    const validatedStreet1 = result.delivery_line_1 || address.street1;
    const validatedCity = components.city_name || address.city;
    const validatedState = components.state_abbreviation || address.state;

    let status: DomainAddress['status'];
    if (dpvMatchCode === 'Y') {
      status = 'validated';
    } else if (dpvMatchCode === 'S' || dpvMatchCode === 'D') {
      status = 'validated';
    } else {
      status = 'invalid';
    }

    const domainAddress: DomainAddress = {
      street1: validatedStreet1,
      street2: result.delivery_line_2 || address.street2,
      city: validatedCity,
      state: validatedState,
      postalCode: fullZip,
      countryCode: address.countryCode || 'US',
      status,
      validatedAt: new Date(),
      validationProvider: 'smarty',
      dpvMatchCode,
    };

    if (status === 'invalid') {
      domainAddress.suggestedAddress = {
        street1: validatedStreet1,
        city: validatedCity,
        state: validatedState,
        postalCode: fullZip,
      };
    }

    return domainAddress;
  } catch (error) {
    console.error('Smarty validation network error:', error);
    return {
      street1: address.street1,
      street2: address.street2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      countryCode: address.countryCode || 'US',
      status: 'invalid',
    };
  }
}

export async function validateAndNormalize(input: AddressInput): Promise<ValidationResult> {
  const normalized = normalizeInput(input);

  if (!normalized.street1 || !normalized.city || !normalized.state || !normalized.postalCode) {
    return {
      success: false,
      address: {
        ...normalized,
        countryCode: normalized.countryCode || 'US',
        status: 'invalid',
      },
      message: 'Missing required address fields (street, city, state, postal code)',
    };
  }

  const result = await validateWithSmarty(normalized);

  if (result.status === 'validated') {
    return {
      success: true,
      address: result,
    };
  }

  if (result.status === 'raw') {
    return {
      success: true,
      address: {
        ...result,
        status: 'standardized',
      },
      message: 'Address was normalized but could not be validated (Smarty credentials not configured)',
    };
  }

  return {
    success: false,
    address: result,
    message: 'Address could not be verified. Please check the address or use the suggested correction.',
  };
}

export function fromLegacyFields(fields: {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}): AddressInput {
  return {
    street1: fields.street || '',
    street2: fields.street2 || undefined,
    city: fields.city || '',
    state: fields.state || '',
    postalCode: fields.zipCode || '',
    countryCode: fields.country || 'US',
  };
}

export function toLegacyFields(address: DomainAddress): {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
} {
  return {
    street: address.street1,
    city: address.city,
    state: address.state,
    zipCode: address.postalCode,
    country: address.countryCode,
  };
}
