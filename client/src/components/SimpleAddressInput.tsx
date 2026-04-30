import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
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

      {/* Manual address fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="street-manual">Street Address</Label>
          <Input
            id="street-manual"
            value={value.street}
            onChange={(e) =>
              handleManualAddressChange('street', e.target.value)
            }
            placeholder="123 Main St"
          />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={value.city}
            onChange={(e) => handleManualAddressChange('city', e.target.value)}
            placeholder="New York"
          />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={value.state}
            onChange={(e) => handleManualAddressChange('state', e.target.value)}
            placeholder="NY"
          />
        </div>
        <div>
          <Label htmlFor="zipCode">ZIP Code</Label>
          <Input
            id="zipCode"
            value={value.zipCode}
            onChange={(e) =>
              handleManualAddressChange('zipCode', e.target.value)
            }
            placeholder="10001"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="country">Country</Label>
        <Input
          id="country"
          value={value.country}
          onChange={(e) => handleManualAddressChange('country', e.target.value)}
          placeholder="United States"
        />
      </div>
    </div>
  );
}
