import fetch from "node-fetch";
import { getAccessToken } from "./upsShipping";

const UPS_ADDRESS_VALIDATION_URL_BASE =
  process.env.UPS_ENV === "production"
    ? "https://onlinetools.ups.com/api"
    : "https://wwwcie.ups.com/api";

export interface UPSAddressValidationRequest {
  street: string;
  city: string;
  state: string;
  postalCode?: string;
  country?: string;
}

export interface UPSAddressValidationResponse {
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

/**
 * Validate an address using UPS Address Validation API
 * @param address - Address to validate
 * @returns Validation result with suggestions
 */
export async function validateAddressWithUPS(
  address: UPSAddressValidationRequest
): Promise<UPSAddressValidationResponse> {
  try {
    console.log('🔍 UPS Address Validation: Starting validation for:', address);
    
    const token = await getAccessToken();
    
    // UPS Address Validation API payload (correct format)
    const requestPayload = {
      XAVRequest: {
        AddressKeyFormat: {
          ConsigneeName: "Customer",
          AddressLine: [address.street],
          PoliticalDivision2: address.city,
          PoliticalDivision1: address.state,
          PostcodePrimaryLow: address.postalCode || "",
          CountryCode: address.country || "US"
        }
      }
    };

    console.log('🔍 UPS Address Validation: Request payload:', JSON.stringify(requestPayload, null, 2));

    const response = await fetch(`${UPS_ADDRESS_VALIDATION_URL_BASE}/addressvalidation/v1/1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "transactionSrc": "testing",
        "transId": `AV${Date.now()}`
      },
      body: JSON.stringify(requestPayload)
    });

    console.log('🔍 UPS Address Validation: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ UPS Address Validation: API error:', errorText);
      
      // Return original address if validation fails
      return {
        isValid: false,
        suggestions: [{
          street: address.street,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode || "",
          country: address.country || "US"
        }],
        message: `UPS validation failed: ${response.status}`
      };
    }

    const data = await response.json() as any;
    console.log('✅ UPS Address Validation: Response received:', JSON.stringify(data, null, 2));

    // Parse UPS response (XAVRequest format)
    const validationResult = data.XAVResponse;
    
    if (validationResult && validationResult.Candidate) {
      // Handle both single candidate (object) and multiple candidates (array)
      const candidates = Array.isArray(validationResult.Candidate) ? 
        validationResult.Candidate : [validationResult.Candidate];
      
      const suggestions = candidates.map((candidate: any) => {
        const addr = candidate.AddressKeyFormat || candidate;
        const addressLine = Array.isArray(addr.AddressLine) ? addr.AddressLine[0] : addr.AddressLine;
        const postalCode = addr.PostcodePrimaryLow || "";
        const extendedCode = addr.PostcodeExtendedLow || "";
        const fullZip = extendedCode ? `${postalCode}-${extendedCode}` : postalCode;
        
        return {
          street: addressLine || address.street,
          city: addr.PoliticalDivision2 || address.city,
          state: addr.PoliticalDivision1 || address.state,
          postalCode: fullZip,
          country: addr.CountryCode || address.country || "US"
        };
      });

      // Accept both single valid matches and multiple valid matches
      // UPS uses empty strings to indicate presence of indicators
      const isValid = ('ValidAddressIndicator' in validationResult) || ('AmbiguousAddressIndicator' in validationResult);
      console.log(`✅ UPS Address Validation: Found ${suggestions.length} address suggestions, valid: ${isValid}`);
      console.log('✅ UPS suggestions:', suggestions);

      return {
        isValid,
        suggestions: suggestions.filter(Boolean),
        message: isValid ? "Address validated successfully" : "Multiple address matches found"
      };
    } else if (validationResult && validationResult.NoCandidatesIndicator) {
      console.log('⚠️ UPS Address Validation: No valid address found');
      return {
        isValid: false,
        suggestions: [{
          street: address.street,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode || "",
          country: address.country || "US"
        }],
        message: "No valid address found"
      };
    }

    // If no validation results, return original address
    return {
      isValid: false,
      suggestions: [{
        street: address.street,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode || "",
        country: address.country || "US"
      }],
      message: "No validation results returned"
    };

  } catch (error) {
    console.error('❌ UPS Address Validation: Error during validation:', error);
    
    // Return original address on error
    return {
      isValid: false,
      suggestions: [{
        street: address.street,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode || "",
        country: address.country || "US"
      }],
      message: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}

/**
 * Get address autocomplete suggestions using UPS (simulated)
 * Note: UPS doesn't have a true autocomplete API like Google Maps
 * This function provides basic address formatting and validation
 * @param query - Search query
 * @returns Array of formatted address suggestions
 */
export async function getUPSAddressAutocomplete(query: string): Promise<string[]> {
  try {
    console.log('🔍 UPS Address Autocomplete: Processing query:', query);
    
    // Parse the query to extract address components
    const suggestions: string[] = [];
    
    // If the query contains basic address components, try to validate it
    if (query.includes(',') || /\d/.test(query)) {
      // Try to parse as a partial address
      const parts = query.split(',').map(p => p.trim());
      
      if (parts.length >= 1) {
        const street = parts[0];
        const cityState = parts[1] || '';
        
        // Extract city and state if provided
        const cityStateMatch = cityState.match(/^(.+?)\s+([A-Z]{2})$/);
        let city = cityStateMatch ? cityStateMatch[1] : cityState;
        let state = cityStateMatch ? cityStateMatch[2] : '';
        
        // If we have enough info, try validation
        if (street && city && state) {
          try {
            const validationResult = await validateAddressWithUPS({
              street,
              city,
              state
            });
            
            // Convert validation results to autocomplete suggestions
            if (validationResult.suggestions && validationResult.suggestions.length > 0) {
              suggestions.push(...validationResult.suggestions.map(addr => 
                `${addr.street}, ${addr.city}, ${addr.state} ${addr.postalCode}`.trim()
              ));
            }
          } catch (error) {
            console.error('UPS validation error in autocomplete:', error);
          }
        }
      }
      
      // Add the original query as a fallback
      if (suggestions.length === 0) {
        suggestions.push(query);
      }
    } else {
      // For simple queries, return formatted suggestions
      suggestions.push(query);
    }
    
    console.log('✅ UPS Address Autocomplete: Generated suggestions:', suggestions);
    return suggestions.slice(0, 5); // Limit to 5 suggestions
    
  } catch (error) {
    console.error('❌ UPS Address Autocomplete: Error:', error);
    return [query]; // Return original query on error
  }
}