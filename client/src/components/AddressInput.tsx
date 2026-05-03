import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { AddressData } from '@/utils/addressUtils';

interface AddressInputProps {
  label: string;
  value: AddressData;
  onChange: (address: AddressData) => void;
  required?: boolean;
}

export default function AddressInput({
  label,
  value,
  onChange,
  required = false,
}: AddressInputProps) {
  const handleChange = (field: keyof AddressData, newValue: string) => {
    onChange({ ...value, [field]: newValue });
  };

  const handleZipCodeChange = (newValue: string) => {
    if (!value.international) {
      const sanitized = newValue.replace(/[^0-9-]/g, '');
      handleChange('zipCode', sanitized);
    } else {
      const sanitized = newValue.replace(/[^A-Za-z0-9\s-]/g, '');
      handleChange('zipCode', sanitized);
    }
  };

  const handleInternationalChange = (checked: boolean) => {
    onChange({ ...value, international: checked });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="street">Street Address</Label>
          <Input
            id="street"
            value={value.street}
            onChange={(e) => handleChange('street', e.target.value)}
            placeholder="123 Main St"
          />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={value.city}
            onChange={(e) => handleChange('city', e.target.value)}
            placeholder="New York"
          />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            value={value.state}
            onChange={(e) => handleChange('state', e.target.value)}
            placeholder="NY"
          />
        </div>
        <div>
          <Label htmlFor="zipCode">ZIP Code</Label>
          <Input
            id="zipCode"
            data-testid="input-zipcode"
            value={value.zipCode}
            onChange={(e) => handleZipCodeChange(e.target.value)}
            placeholder={value.international ? 'ABC 123' : '10001'}
          />
          <div className="flex items-center space-x-2 mt-2">
            <Checkbox
              id="international"
              data-testid="checkbox-international"
              checked={value.international || false}
              onCheckedChange={handleInternationalChange}
            />
            <Label
              htmlFor="international"
              className="text-sm font-normal cursor-pointer"
            >
              International
            </Label>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="country">Country</Label>
        <Input
          id="country"
          value={value.country}
          onChange={(e) => handleChange('country', e.target.value)}
          placeholder="United States"
        />
      </div>
    </div>
  );
}
