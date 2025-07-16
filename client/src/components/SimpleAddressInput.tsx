import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import debounce from 'lodash.debounce';
import type { AddressData } from '@/utils/addressUtils';

interface SimpleAddressInputProps {
  label: string;
  value: AddressData;
  onChange: (address: AddressData) => void;
  required?: boolean;
}

export default function SimpleAddressInput({ label, value, onChange, required = false }: SimpleAddressInputProps) {
  const [query, setQuery] = useState(value.street || '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Debounced fetch function
  const fetchSuggestions = debounce(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    setIsLoading(true);
    try {
      const url = `/api/address/autocomplete?query=${encodeURIComponent(q)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Address autocomplete error:', error);
      toast({
        title: 'Address lookup failed',
        description: 'Unable to fetch address suggestions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, 300);

  useEffect(() => {
    fetchSuggestions(query);
  }, [query]);

  useEffect(() => {
    setQuery(value.street || '');
  }, [value.street]);

  const parseAddressFromSuggestion = (suggestion: string): AddressData => {
    const parts = suggestion.split(', ');
    
    if (parts.length >= 3) {
      const street = parts[0];
      const city = parts[1];
      const stateZip = parts[2];
      
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
    
    return {
      street: suggestion,
      city: value.city,
      state: value.state,
      zipCode: value.zipCode,
      country: value.country || 'United States'
    };
  };

  const handleSelect = (suggestion: string) => {
    const parsedAddress = parseAddressFromSuggestion(suggestion);
    setQuery(parsedAddress.street);
    onChange(parsedAddress);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    
    toast({
      title: 'Address selected',
      description: 'Address fields have been filled',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    onChange({
      ...value,
      street: newValue
    });
  };

  const handleManualAddressChange = (field: keyof AddressData, newValue: string) => {
    onChange({
      ...value,
      [field]: newValue,
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Label htmlFor="street" className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MapPin className="h-4 w-4 text-gray-400" />
          </div>
          <Input
            ref={inputRef}
            id="street"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => {
              // Delay hiding suggestions to allow clicking
              setTimeout(() => setShowSuggestions(false), 200);
            }}
            placeholder="Start typing address..."
            className="pl-10 pr-10"
          />
          {isLoading && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          )}
        </div>
        
        {showSuggestions && suggestions.length > 0 && (
          <div 
            ref={suggestionsRef}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                onClick={() => handleSelect(suggestion)}
                className={cn(
                  "px-3 py-2 cursor-pointer text-sm hover:bg-gray-100",
                  selectedIndex === index && "bg-blue-50 text-blue-600"
                )}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual address fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="street-manual">Street Address</Label>
          <Input
            id="street-manual"
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