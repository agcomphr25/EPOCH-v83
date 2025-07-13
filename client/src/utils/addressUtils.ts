import axios from 'axios';

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
    const response = await axios.get(`/api/address/autocomplete`, {
      params: { query },
    });
    return response.data;
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
    const response = await axios.post(`/api/address/validate`, { address });
    return response.data;
  } catch (error) {
    console.error('Error validating address:', error);
    const msg = (error as any).response?.data?.message || 'Address validation failed';
    throw new Error(msg);
  }
}