import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { autocompleteAddress, validateAddress, type AddressData } from '@/utils/addressUtils';
import { useToast } from '@/hooks/use-toast';
import debounce from 'lodash.debounce';

interface AddressInputProps {
  label: string;
  value: AddressData;
  onChange: (address: AddressData) => void;
  required?: boolean;
}

export default function AddressInput({ label, value, onChange, required = false }: AddressInputProps) {
  const [query, setQuery] = useState(value.street || '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Debounced fetch function
  const fetchSuggestions = debounce(async (q: string) => {
    if (!q) {
      setSuggestions([]);
      return;
    }
    console.log('Fetching suggestions for:', q);
    setIsLoading(true);
    try {
      const results = await autocompleteAddress(q);
      console.log('Autocomplete results:', results);
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

  const parseAddressFromSuggestion = (suggestion: string): AddressData => {
    // SmartyStreets typically returns suggestions in format: "123 Main St, City, ST 12345"
    const parts = suggestion.split(', ');
    
    if (parts.length >= 3) {
      const street = parts[0];
      const city = parts[1];
      const stateZip = parts[2];
      
      // Parse state and zip from "ST 12345" format
      const stateZipMatch = stateZip.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      const state = stateZipMatch ? stateZipMatch[1] : '';
      const zipCode = stateZipMatch ? stateZipMatch[2] : '';
      
      return {
        street,
        city,
        state,
        zipCode,
        country: 'United States'
      };
    }
    
    // Fallback: treat the entire suggestion as street address
    return {
      street: suggestion,
      city: value.city,
      state: value.state,
      zipCode: value.zipCode,
      country: value.country || 'United States'
    };
  };

  const handleSelect = async (suggestion: string) => {
    setQuery(suggestion);
    setOpen(false);
    setSuggestions([]);
    
    try {
      // First parse the suggestion to extract address components
      const parsedAddress = parseAddressFromSuggestion(suggestion);
      
      // Then validate the parsed address with SmartyStreets
      const validated = await validateAddress(parsedAddress);
      onChange(validated);
      toast({
        title: 'Address validated',
        description: 'Address has been validated and all fields filled',
      });
    } catch (error) {
      // If validation fails, still use the parsed address
      const parsedAddress = parseAddressFromSuggestion(suggestion);
      onChange(parsedAddress);
      toast({
        title: 'Address selected',
        description: 'Address fields have been filled. You may need to verify the details.',
        variant: 'default',
      });
    }
  };

  const handleManualAddressChange = (field: keyof AddressData, newValue: string) => {
    onChange({
      ...value,
      [field]: newValue,
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
                <span className={cn(
                  "text-left",
                  !query && "text-muted-foreground"
                )}>
                  {query || "Start typing address..."}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
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
                      value={suggestion}
                      onSelect={() => handleSelect(suggestion)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          query === suggestion ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {suggestion}
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
            onChange={(e) => handleManualAddressChange('street', e.target.value)}
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
            onChange={(e) => handleManualAddressChange('zipCode', e.target.value)}
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