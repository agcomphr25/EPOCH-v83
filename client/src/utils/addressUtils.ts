import { apiRequest } from '@/lib/queryClient';

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

/**
 * Fetch autocomplete suggestions for an address query.
 * @param query - Address search query
 * @returns Array of suggestion strings
 */
export async function autocompleteAddress(query: string): Promise<string[]> {
  try {
    const response = await apiRequest('/api/autocomplete-address', {
      method: 'POST',
      body: { search: query }
    });
    
    console.log('SmartyStreets autocomplete response:', response);
    
    // Transform the response to extract the text property from each suggestion
    if (response.suggestions && Array.isArray(response.suggestions)) {
      return response.suggestions.map((suggestion: any) => suggestion.text || suggestion);
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching address autocomplete:', error);
    throw new Error('Failed to fetch address suggestions');
  }
}

/**
 * Validate a full address object server-side.
 * @param address - Address object to validate
 * @returns Validated address object
 */
export async function validateAddress(address: AddressData): Promise<AddressData> {
  try {
    const response = await apiRequest('/api/validate-address', {
      method: 'POST',
      body: {
        street: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode
      }
    });
    
    console.log('SmartyStreets validation response:', response);
    
    if (response.isValid && response.suggestions && response.suggestions.length > 0) {
      const validatedAddress = response.suggestions[0];
      return {
        street: validatedAddress.street,
        city: validatedAddress.city,
        state: validatedAddress.state,
        zipCode: validatedAddress.zipCode,
        country: address.country || 'United States'
      };
    }
    
    // If validation fails, return the original address
    return address;
  } catch (error) {
    console.error('Error validating address:', error);
    // Return original address on error
    return address;
  }
}