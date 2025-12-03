import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Clock, Search } from 'lucide-react';

interface RecentLotData {
  lotNumber?: string | null;
  batchNumber?: string | null;
  rollNumber?: string | null;
  supplierPartNumber?: string | null;
  fabricType?: string | null;
  expirationDate?: string | null;
}

interface SmartLotInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: 'lot' | 'batch' | 'heat';
}

export default function SmartLotInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = 'lot'
}: SmartLotInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const { data: recentLotsData = [] } = useQuery<RecentLotData[]>({
    queryKey: [`/api/smart-entry/recent-lots?type=${type}`],
    enabled: inputFocused,
  });

  const { data: suggestionsData } = useQuery<{ suggestions: string[] }>({
    queryKey: [`/api/smart-entry/suggestions?field=${type}&value=${value}`],
    enabled: inputFocused && value.length >= 2,
  });

  const recentLots = useMemo(() => {
    return recentLotsData
      .map(item => type === 'lot' ? item.lotNumber : type === 'batch' ? item.batchNumber : item.lotNumber)
      .filter((v): v is string => !!v)
      .slice(0, 5);
  }, [recentLotsData, type]);

  const suggestions = suggestionsData?.suggestions || [];

  const allSuggestions = value.length >= 2 
    ? suggestions 
    : recentLots;

  const handleSelect = (selected: string) => {
    onChange(selected);
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <Label htmlFor={id}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => {
            setInputFocused(true);
            setShowSuggestions(true);
          }}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          placeholder={placeholder}
          required={required}
          className="pr-8"
          data-testid={`input-${id}`}
        />
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      {showSuggestions && allSuggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {value.length < 2 && recentLots.length > 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-1 border-b">
              <Clock className="h-3 w-3" />
              Recently Used
            </div>
          )}
          {allSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between"
              onClick={() => handleSelect(suggestion)}
              data-testid={`suggestion-${id}-${idx}`}
            >
              <span>{suggestion}</span>
              {value.length < 2 && (
                <Badge variant="outline" className="text-xs">Recent</Badge>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
