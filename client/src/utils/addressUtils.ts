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
    const url = `/api/address/autocomplete?query=${encodeURIComponent(query)}`;
    const response = await apiRequest(url);
    return response;
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
    const response = await apiRequest('/api/address/validate', {
      method: 'POST',
      body: { address }
    });
    return response;
  } catch (error) {
    console.error('Error validating address:', error);
    throw new Error('Address validation failed');
  }
}