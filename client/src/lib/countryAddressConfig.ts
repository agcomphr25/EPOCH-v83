export type CountryCode = 'US' | 'AU' | 'CA' | 'GB' | 'NZ' | 'DE' | 'FR' | 'JP' | 'OTHER';

export interface StateProvince {
  code: string;
  name: string;
}

export interface CountryAddressConfig {
  code: CountryCode;
  name: string;
  stateLabel: string;
  postalCodeLabel: string;
  postalCodePattern: RegExp;
  postalCodePlaceholder: string;
  postalCodeErrorMessage: string;
  states: StateProvince[];
  requiresState: boolean;
}

const US_STATES: StateProvince[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'VI', name: 'Virgin Islands' },
  { code: 'GU', name: 'Guam' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'MP', name: 'Northern Mariana Islands' },
];

const AUSTRALIA_STATES: StateProvince[] = [
  { code: 'NSW', name: 'New South Wales' },
  { code: 'VIC', name: 'Victoria' },
  { code: 'QLD', name: 'Queensland' },
  { code: 'WA', name: 'Western Australia' },
  { code: 'SA', name: 'South Australia' },
  { code: 'TAS', name: 'Tasmania' },
  { code: 'ACT', name: 'Australian Capital Territory' },
  { code: 'NT', name: 'Northern Territory' },
];

const CANADA_PROVINCES: StateProvince[] = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

const UK_COUNTIES: StateProvince[] = [
  { code: 'ENG', name: 'England' },
  { code: 'SCT', name: 'Scotland' },
  { code: 'WLS', name: 'Wales' },
  { code: 'NIR', name: 'Northern Ireland' },
];

const NZ_REGIONS: StateProvince[] = [
  { code: 'NTL', name: 'Northland' },
  { code: 'AUK', name: 'Auckland' },
  { code: 'WKO', name: 'Waikato' },
  { code: 'BOP', name: 'Bay of Plenty' },
  { code: 'GIS', name: 'Gisborne' },
  { code: 'HKB', name: "Hawke's Bay" },
  { code: 'TKI', name: 'Taranaki' },
  { code: 'MWT', name: 'Manawatu-Wanganui' },
  { code: 'WGN', name: 'Wellington' },
  { code: 'TAS', name: 'Tasman' },
  { code: 'NSN', name: 'Nelson' },
  { code: 'MBH', name: 'Marlborough' },
  { code: 'WTC', name: 'West Coast' },
  { code: 'CAN', name: 'Canterbury' },
  { code: 'OTA', name: 'Otago' },
  { code: 'STL', name: 'Southland' },
];

const GERMANY_STATES: StateProvince[] = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bavaria' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hesse' },
  { code: 'NI', name: 'Lower Saxony' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NW', name: 'North Rhine-Westphalia' },
  { code: 'RP', name: 'Rhineland-Palatinate' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Saxony' },
  { code: 'ST', name: 'Saxony-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thuringia' },
];

const JAPAN_PREFECTURES: StateProvince[] = [
  { code: 'HOKKAIDO', name: 'Hokkaido' },
  { code: 'AOMORI', name: 'Aomori' },
  { code: 'IWATE', name: 'Iwate' },
  { code: 'MIYAGI', name: 'Miyagi' },
  { code: 'AKITA', name: 'Akita' },
  { code: 'YAMAGATA', name: 'Yamagata' },
  { code: 'FUKUSHIMA', name: 'Fukushima' },
  { code: 'IBARAKI', name: 'Ibaraki' },
  { code: 'TOCHIGI', name: 'Tochigi' },
  { code: 'GUNMA', name: 'Gunma' },
  { code: 'SAITAMA', name: 'Saitama' },
  { code: 'CHIBA', name: 'Chiba' },
  { code: 'TOKYO', name: 'Tokyo' },
  { code: 'KANAGAWA', name: 'Kanagawa' },
  { code: 'NIIGATA', name: 'Niigata' },
  { code: 'TOYAMA', name: 'Toyama' },
  { code: 'ISHIKAWA', name: 'Ishikawa' },
  { code: 'FUKUI', name: 'Fukui' },
  { code: 'YAMANASHI', name: 'Yamanashi' },
  { code: 'NAGANO', name: 'Nagano' },
  { code: 'GIFU', name: 'Gifu' },
  { code: 'SHIZUOKA', name: 'Shizuoka' },
  { code: 'AICHI', name: 'Aichi' },
  { code: 'MIE', name: 'Mie' },
  { code: 'SHIGA', name: 'Shiga' },
  { code: 'KYOTO', name: 'Kyoto' },
  { code: 'OSAKA', name: 'Osaka' },
  { code: 'HYOGO', name: 'Hyogo' },
  { code: 'NARA', name: 'Nara' },
  { code: 'WAKAYAMA', name: 'Wakayama' },
  { code: 'TOTTORI', name: 'Tottori' },
  { code: 'SHIMANE', name: 'Shimane' },
  { code: 'OKAYAMA', name: 'Okayama' },
  { code: 'HIROSHIMA', name: 'Hiroshima' },
  { code: 'YAMAGUCHI', name: 'Yamaguchi' },
  { code: 'TOKUSHIMA', name: 'Tokushima' },
  { code: 'KAGAWA', name: 'Kagawa' },
  { code: 'EHIME', name: 'Ehime' },
  { code: 'KOCHI', name: 'Kochi' },
  { code: 'FUKUOKA', name: 'Fukuoka' },
  { code: 'SAGA', name: 'Saga' },
  { code: 'NAGASAKI', name: 'Nagasaki' },
  { code: 'KUMAMOTO', name: 'Kumamoto' },
  { code: 'OITA', name: 'Oita' },
  { code: 'MIYAZAKI', name: 'Miyazaki' },
  { code: 'KAGOSHIMA', name: 'Kagoshima' },
  { code: 'OKINAWA', name: 'Okinawa' },
];

export const COUNTRY_ADDRESS_CONFIGS: Record<CountryCode, CountryAddressConfig> = {
  US: {
    code: 'US',
    name: 'United States',
    stateLabel: 'State',
    postalCodeLabel: 'ZIP Code',
    postalCodePattern: /^\d{5}(-\d{4})?$/,
    postalCodePlaceholder: '12345 or 12345-6789',
    postalCodeErrorMessage: 'Enter a valid 5-digit ZIP code (e.g., 12345 or 12345-6789)',
    states: US_STATES,
    requiresState: true,
  },
  AU: {
    code: 'AU',
    name: 'Australia',
    stateLabel: 'State/Territory',
    postalCodeLabel: 'Postcode',
    postalCodePattern: /^\d{4}$/,
    postalCodePlaceholder: '2000',
    postalCodeErrorMessage: 'Enter a valid 4-digit Australian postcode',
    states: AUSTRALIA_STATES,
    requiresState: true,
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    stateLabel: 'Province/Territory',
    postalCodeLabel: 'Postal Code',
    postalCodePattern: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
    postalCodePlaceholder: 'A1A 1A1',
    postalCodeErrorMessage: 'Enter a valid Canadian postal code (e.g., A1A 1A1)',
    states: CANADA_PROVINCES,
    requiresState: true,
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    stateLabel: 'Country/Region',
    postalCodeLabel: 'Postcode',
    postalCodePattern: /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/,
    postalCodePlaceholder: 'SW1A 1AA',
    postalCodeErrorMessage: 'Enter a valid UK postcode (e.g., SW1A 1AA)',
    states: UK_COUNTIES,
    requiresState: false,
  },
  NZ: {
    code: 'NZ',
    name: 'New Zealand',
    stateLabel: 'Region',
    postalCodeLabel: 'Postcode',
    postalCodePattern: /^\d{4}$/,
    postalCodePlaceholder: '1010',
    postalCodeErrorMessage: 'Enter a valid 4-digit New Zealand postcode',
    states: NZ_REGIONS,
    requiresState: false,
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    stateLabel: 'State (Bundesland)',
    postalCodeLabel: 'Postal Code (PLZ)',
    postalCodePattern: /^\d{5}$/,
    postalCodePlaceholder: '10115',
    postalCodeErrorMessage: 'Enter a valid 5-digit German postal code',
    states: GERMANY_STATES,
    requiresState: false,
  },
  FR: {
    code: 'FR',
    name: 'France',
    stateLabel: 'Region',
    postalCodeLabel: 'Code Postal',
    postalCodePattern: /^\d{5}$/,
    postalCodePlaceholder: '75001',
    postalCodeErrorMessage: 'Enter a valid 5-digit French postal code',
    states: [],
    requiresState: false,
  },
  JP: {
    code: 'JP',
    name: 'Japan',
    stateLabel: 'Prefecture',
    postalCodeLabel: 'Postal Code',
    postalCodePattern: /^\d{3}-?\d{4}$/,
    postalCodePlaceholder: '100-0001',
    postalCodeErrorMessage: 'Enter a valid Japanese postal code (e.g., 100-0001)',
    states: JAPAN_PREFECTURES,
    requiresState: true,
  },
  OTHER: {
    code: 'OTHER',
    name: 'Other',
    stateLabel: 'State/Province/Region',
    postalCodeLabel: 'Postal/ZIP Code',
    postalCodePattern: /^.{1,20}$/,
    postalCodePlaceholder: 'Enter postal code',
    postalCodeErrorMessage: 'Enter a valid postal code',
    states: [],
    requiresState: false,
  },
};

export const SUPPORTED_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'OTHER', name: 'Other Country' },
];

export function getCountryCodeFromName(countryName: string): CountryCode {
  const normalizedName = countryName.toLowerCase().trim();
  
  const countryNameMapping: Record<string, CountryCode> = {
    'united states': 'US',
    'usa': 'US',
    'us': 'US',
    'australia': 'AU',
    'au': 'AU',
    'canada': 'CA',
    'ca': 'CA',
    'united kingdom': 'GB',
    'uk': 'GB',
    'gb': 'GB',
    'great britain': 'GB',
    'england': 'GB',
    'new zealand': 'NZ',
    'nz': 'NZ',
    'germany': 'DE',
    'de': 'DE',
    'deutschland': 'DE',
    'france': 'FR',
    'fr': 'FR',
    'japan': 'JP',
    'jp': 'JP',
  };

  return countryNameMapping[normalizedName] || 'OTHER';
}

export function getAddressConfigForCountry(countryName: string): CountryAddressConfig {
  const countryCode = getCountryCodeFromName(countryName);
  return COUNTRY_ADDRESS_CONFIGS[countryCode];
}

export function validatePostalCode(postalCode: string, countryName: string): boolean {
  const config = getAddressConfigForCountry(countryName);
  return config.postalCodePattern.test(postalCode.trim());
}

export function getStatesForCountry(countryName: string): StateProvince[] {
  const config = getAddressConfigForCountry(countryName);
  return config.states;
}
