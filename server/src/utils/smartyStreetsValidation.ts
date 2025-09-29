// SmartyStreets API integration using direct HTTP calls
// This is more reliable than the SDK which has import issues

export interface SmartyStreetsAutocompleteResponse {
  suggestions: Array<{
    text: string;
    streetLine: string;
    city: string;
    state: string;
    zipCode: string;
    entries: number;
  }>;
}

export interface SmartyStreetsAddressValidationRequest {
  street: string;
  city: string;
  state: string;
  postalCode?: string;
}

export interface SmartyStreetsAddressValidationResponse {
  isValid: boolean;
  suggestions: Array<{
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>;
  message?: string;
}

// SmartyStreets API endpoints
const SMARTYSTREETS_BASE_URL = 'https://us-autocomplete-pro.api.smartystreets.com';
const SMARTYSTREETS_STREET_API_URL = 'https://us-street.api.smartystreets.com';

/**
 * Get address autocomplete suggestions from SmartyStreets US Autocomplete Pro API
 * @param query - Search query for address autocomplete
 * @returns Array of address suggestions
 */
export async function getSmartyStreetsAutocomplete(query: string): Promise<SmartyStreetsAutocompleteResponse> {
  try {
    console.log('🔍 SmartyStreets Autocomplete: Processing query:', query);
    
    const authId = process.env.SMARTYSTREETS_AUTH_ID;
    const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;
    
    if (!authId || !authToken) {
      console.log('⚠️ SmartyStreets credentials missing, returning manual input only');
      return {
        suggestions: [{
          text: query,
          streetLine: query,
          city: '',
          state: '',
          zipCode: '',
          entries: 1
        }]
      };
    }

    // Build SmartyStreets US Autocomplete Pro API URL
    const apiUrl = new URL('/lookup', SMARTYSTREETS_BASE_URL);
    apiUrl.searchParams.append('auth-id', authId);
    apiUrl.searchParams.append('auth-token', authToken);
    apiUrl.searchParams.append('search', query);
    apiUrl.searchParams.append('max_suggestions', '10');
    
    console.log('🔍 SmartyStreets API URL:', apiUrl.toString().replace(/(auth-token=)[^&]*/, '$1[HIDDEN]'));

    const response = await fetch(apiUrl.toString());
    
    if (!response.ok) {
      console.error('❌ SmartyStreets API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('❌ SmartyStreets API error details:', errorText);
      
      // Return manual input on API error
      return {
        suggestions: [{
          text: query,
          streetLine: query,
          city: '',
          state: '',
          zipCode: '',
          entries: 1
        }]
      };
    }

    const data = await response.json();
    console.log('✅ SmartyStreets Autocomplete: Response received:', data);
    
    if (data && data.suggestions && Array.isArray(data.suggestions)) {
      const suggestions = data.suggestions.map((suggestion: any) => ({
        text: suggestion.text || query,
        streetLine: suggestion.street_line || '',
        city: suggestion.city || '',
        state: suggestion.state || '',
        zipCode: suggestion.zipcode || '',
        entries: suggestion.entries || 1
      }));
      
      // Always add the user's manual input as a fallback option
      suggestions.push({
        text: query,
        streetLine: query,
        city: '',
        state: '',
        zipCode: '',
        entries: 1
      });
      
      console.log('🔍 SmartyStreets found', suggestions.length - 1, 'suggestions plus manual input');
      return { suggestions };
    } else {
      console.log('⚠️ SmartyStreets: No suggestions returned, using manual input');
      return {
        suggestions: [{
          text: query,
          streetLine: query,
          city: '',
          state: '',
          zipCode: '',
          entries: 1
        }]
      };
    }
    
  } catch (error) {
    console.error('❌ SmartyStreets Autocomplete error:', error);
    return {
      suggestions: [{
        text: query,
        streetLine: query,
        city: '',
        state: '',
        zipCode: '',
        entries: 1
      }]
    };
  }
}

/**
 * Validate an address using SmartyStreets US Street API
 * @param address - Address to validate
 * @returns Validation result with suggestions
 */
export async function validateAddressWithSmartyStreets(
  address: SmartyStreetsAddressValidationRequest
): Promise<SmartyStreetsAddressValidationResponse> {
  try {
    console.log('🔍 SmartyStreets Address Validation: Starting validation for:', address);
    
    const authId = process.env.SMARTYSTREETS_AUTH_ID;
    const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;
    
    if (!authId || !authToken) {
      console.log('⚠️ SmartyStreets credentials missing, returning original address');
      return {
        isValid: false,
        suggestions: [{
          street: address.street,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode || "",
          country: "US"
        }],
        message: "SmartyStreets credentials not configured"
      };
    }

    // Build SmartyStreets US Street API URL
    const apiUrl = new URL('/street-address', SMARTYSTREETS_STREET_API_URL);
    apiUrl.searchParams.append('auth-id', authId);
    apiUrl.searchParams.append('auth-token', authToken);
    apiUrl.searchParams.append('street', address.street);
    apiUrl.searchParams.append('city', address.city);
    apiUrl.searchParams.append('state', address.state);
    if (address.postalCode) {
      apiUrl.searchParams.append('zipcode', address.postalCode);
    }
    apiUrl.searchParams.append('candidates', '5');
    
    console.log('🔍 SmartyStreets Street API URL:', apiUrl.toString().replace(/(auth-token=)[^&]*/, '$1[HIDDEN]'));

    const response = await fetch(apiUrl.toString());
    
    if (!response.ok) {
      console.error('❌ SmartyStreets Street API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('❌ SmartyStreets Street API error details:', errorText);
      
      return {
        isValid: false,
        suggestions: [{
          street: address.street,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode || "",
          country: "US"
        }],
        message: `SmartyStreets API error: ${response.status}`
      };
    }

    const data = await response.json();
    console.log('✅ SmartyStreets Address Validation: Response received:', data);
    
    if (data && Array.isArray(data) && data.length > 0) {
      const suggestions = data.map((result: any) => ({
        street: result.delivery_line_1 || address.street,
        city: result.components?.city_name || address.city,
        state: result.components?.state_abbreviation || address.state,
        postalCode: `${result.components?.zipcode || ''}${result.components?.plus4_code ? '-' + result.components.plus4_code : ''}`.trim() || address.postalCode || "",
        country: "US"
      }));
      
      console.log('✅ SmartyStreets found', suggestions.length, 'validated addresses');
      return {
        isValid: true,
        suggestions,
        message: "Address validated successfully"
      };
    } else {
      console.log('⚠️ SmartyStreets: No valid addresses found');
      return {
        isValid: false,
        suggestions: [{
          street: address.street,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode || "",
          country: "US"
        }],
        message: "No valid address found"
      };
    }
    
  } catch (error) {
    console.error('❌ SmartyStreets Address Validation error:', error);
    return {
      isValid: false,
      suggestions: [{
        street: address.street,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode || "",
        country: "US"
      }],
      message: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}