export type AddressStatus =
  | 'raw'
  | 'standardized'
  | 'validated'
  | 'invalid'
  | 'overridden';

export interface AddressInput {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode?: string;
}

export interface DomainAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  status: AddressStatus;
  validatedAt?: Date;
  validationProvider?: 'smarty';
  dpvMatchCode?: string;
  overrideReason?: string;
  suggestedAddress?: {
    street1: string;
    city: string;
    state: string;
    postalCode: string;
  };
}

export interface ValidationResult {
  success: boolean;
  address: DomainAddress;
  message?: string;
}
