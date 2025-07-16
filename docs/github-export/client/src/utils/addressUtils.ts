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
    console.log('Making API request to:', url);
    
    // Try direct fetch first
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    });
    
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('API response:', data);
    return data;
  } catch (error) {
    console.error('Error fetching address autocomplete:', error);
    console.error('Error details:', error);
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