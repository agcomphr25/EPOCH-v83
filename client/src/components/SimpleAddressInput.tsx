import { MapPin } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type AddressData } from '@/utils/addressUtils';

interface SimpleAddressInputProps {
  label: string;
  value: AddressData;
  onChange: (address: AddressData) => void;
  required?: boolean;
}

export default function SimpleAddressInput({
  label,
  value,
  onChange,
  required = false,
}: SimpleAddressInputProps) {
  const normalizedCountry = value.country.trim().toLowerCase();
  const isInternational =
    normalizedCountry.length > 0 &&
    ![
      'united states',
      'united states of america',
      'usa',
      'us',
      'u.s.',
      'u.s.a.',
    ].includes(normalizedCountry);

  const handleManualAddressChange = (
    field: keyof AddressData,
    newValue: string
  ) => {
    onChange({
      ...value,
      [field]: newValue,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
          <MapPin className="h-4 w-4" />
          <span>Enter address details below</span>
        </div>
      </div>

      <div>
        <Label htmlFor="country">Country</Label>
        <Input
          id="country"
          value={value.country}
          onChange={(e) => handleManualAddressChange('country', e.target.value)}
          placeholder="United States"
          autoComplete="country-name"
          data-testid="input-address-country"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Enter the full country name. International addresses may use province,
          region, and postal-code formats.
        </p>
      </div>

      {/* Manual address fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label htmlFor="street-manual">Street Address / Address Lines</Label>
          <Textarea
            id="street-manual"
            value={value.street}
            onChange={(e) =>
              handleManualAddressChange('street', e.target.value)
            }
            placeholder={
              isInternational
                ? 'Building, street, district, or additional address lines'
                : '123 Main St\nSuite 200'
            }
            autoComplete="street-address"
            data-testid="input-address-street"
          />
        </div>
        <div>
          <Label htmlFor="city">City / Locality</Label>
          <Input
            id="city"
            value={value.city}
            onChange={(e) => handleManualAddressChange('city', e.target.value)}
            placeholder={isInternational ? 'City or locality' : 'New York'}
            autoComplete="address-level2"
            data-testid="input-address-city"
          />
        </div>
        <div>
          <Label htmlFor="state">
            {isInternational
              ? 'Province / Region'
              : 'State / Province / Region'}
          </Label>
          <Input
            id="state"
            value={value.state}
            onChange={(e) => handleManualAddressChange('state', e.target.value)}
            placeholder={isInternational ? 'Province, county, or region' : 'NY'}
            autoComplete="address-level1"
            data-testid="input-address-region"
          />
        </div>
        <div>
          <Label htmlFor="zipCode">ZIP / Postal Code</Label>
          <Input
            id="zipCode"
            value={value.zipCode}
            onChange={(e) =>
              handleManualAddressChange('zipCode', e.target.value)
            }
            placeholder={isInternational ? 'Postal code' : '10001'}
            autoComplete="postal-code"
            data-testid="input-address-postal-code"
          />
        </div>
      </div>
    </div>
  );
}
