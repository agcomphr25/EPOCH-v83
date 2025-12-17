import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  autocompleteAddress,
  validateAddress,
  type AddressData,
  type AddressSuggestion,
} from '@/utils/addressUtils';
import { useToast } from '@/hooks/use-toast';
import debounce from 'lodash.debounce';

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
  const [query, setQuery] = useState(value.street || '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Debounced fetch function
  const fetchSuggestions = debounce(async (q: string) => {
    if (!q) {
      setSuggestions([]);
      return;
    }
    console.log('Fetching suggestions for query:', q);
    setIsLoading(true);
    try {
      const results = await autocompleteAddress(q);
      console.log('Autocomplete results received:', results);
      setSuggestions(results);
    } catch (error) {
      console.error('Address autocomplete error:', error);
      toast({
        title: 'Address lookup failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, 300);

  useEffect(() => {
    fetchSuggestions(query);
  }, [query]);

  // Update query when value.street changes (for external updates)
  useEffect(() => {
    setQuery(value.street || '');
  }, [value.street]);

  const handleSelect = async (suggestion: AddressSuggestion) => {
    setQuery(suggestion.text);
    setOpen(false);
    setSuggestions([]);

    // Use the structured fields directly from the suggestion
    const addressData: AddressData = {
      street: suggestion.streetLine,
      city: suggestion.city,
      state: suggestion.state,
      zipCode: suggestion.zipCode,
      country: 'United States',
    };

    try {
      // Validate the address with SmartyStreets
      const validated = await validateAddress(addressData);
      onChange(validated);
      toast({
        title: 'Address validated',
        description: 'Address has been validated and all fields filled',
      });
    } catch (error) {
      // If validation fails, still use the parsed address
      onChange(addressData);
      toast({
        title: 'Address selected',
        description:
          'Address fields have been filled. You may need to verify the details.',
        variant: 'default',
      });
    }
  };

  const handleManualAddressChange = (
    field: keyof AddressData,
    newValue: string
  ) => {
    onChange({
      ...value,
      [field]: newValue,
    });
  };

  const handleZipCodeChange = (newValue: string) => {
    // If not international, only allow numbers and hyphens (US format)
    if (!value.international) {
      const sanitized = newValue.replace(/[^0-9-]/g, '');
      handleManualAddressChange('zipCode', sanitized);
    } else {
      // International: allow alphanumeric and common postal code characters
      const sanitized = newValue.replace(/[^A-Za-z0-9\s-]/g, '');
      handleManualAddressChange('zipCode', sanitized);
    }
  };

  const handleInternationalChange = (checked: boolean) => {
    onChange({
      ...value,
      international: checked,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="street" className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
            >
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span
                  className={cn('text-left', !query && 'text-muted-foreground')}
                >
                  {query || 'Start typing address...'}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-full p-0 z-[9999]"
            side="bottom"
            align="start"
            sideOffset={4}
            avoidCollisions={true}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command>
              <CommandInput
                placeholder="Search address..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty>
                  {isLoading ? 'Loading...' : 'No addresses found.'}
                </CommandEmpty>
                <CommandGroup>
                  {suggestions.map((suggestion, index) => (
                    <CommandItem
                      key={index}
                      value={suggestion.text}
                      onSelect={() => handleSelect(suggestion)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          query === suggestion.text ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {suggestion.text}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Manual address fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="street">Street Address</Label>
          <Input
            id="street"
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
          onChange={(e) => handleManualAddressChange('country', e.target.value)}
          placeholder="United States"
        />
      </div>
    </div>
  );
}
