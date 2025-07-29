// Company Configuration
// This file contains static company information used across forms and documents
// Update these values as needed for your organization

export const COMPANY_INFO = {
  name: 'Strata-G Solutions, LLC',
  streetAddress: '2901 Wall Triana Hwy SW, #200',
  city: 'Huntsville',
  state: 'AL',
  zipCode: '35824',
  
  // Additional company details for future use
  phone: '',
  email: '',
  website: '',
  
  // Quality/Manufacturing specific info
  qualityManager: '',
  certificationNumber: '',
} as const;

// Certificate-specific text templates
export const CERTIFICATE_TEMPLATES = {
  manufacturersConformance: {
    certificationText: 'THIS IS TO CERTIFY THAT THE VERTICAL STABILIZER HAS BEEN MANUFACTURED, PROCESSED AND INSPECTED IN ACCORDANCE WITH THE MATERIALS AND PROCEDURES SPECIFIED ON PROVIDED DRAWING. FURTHERMORE, INSPECTION RESULTS SIGNIFY THAT THE TAIL CONE DELIVERED IS FULLY ACCEPTABLE AND IN COMPLETE CONFORMANCE TO ALL SPECIFICATIONS.',
    otherDataText: 'OTHER DATA, NOT ENCLOSED WITH THIS SHIPMENT, ARE MAINTAINED ON FILE AND ARE AVAILABLE UPON REQUEST.',
  }
} as const;