import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface FeatureDefinition {
  id: string;
  name: string;
  type: 'dropdown' | 'search' | 'text' | 'multiselect';
  options?: { value: string; label: string; price?: number }[];
}

interface ProductConfigurationFormProps {
  modelId: string;
  setModelId: (value: string) => void;
  handedness: string;
  setHandedness: (value: string) => void;
  tikkaOption: string;
  setTikkaOption: (value: string) => void;
  features: Record<string, any>;
  setFeatures: (value: Record<string, any>) => void;
  featureQuantities: Record<string, Record<string, number>>;
  setFeatureQuantities: (value: Record<string, Record<string, number>>) => void;
  shankLength: string;
  setShankLength: (value: string) => void;
  isCustomOrder: string;
  setIsCustomOrder: (value: string) => void;
  errors?: Record<string, string>;
}

export default function ProductConfigurationForm({
  modelId,
  setModelId,
  handedness,
  setHandedness,
  tikkaOption,
  setTikkaOption,
  features,
  setFeatures,
  featureQuantities,
  setFeatureQuantities,
  shankLength,
  setShankLength,
  isCustomOrder,
  setIsCustomOrder,
  errors = {}
}: ProductConfigurationFormProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const [paintQuery, setPaintQuery] = useState('');

  // Load stock models
  const { data: modelOptions = [] } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
  });

  // Load feature definitions
  const { data: featureDefs = [] } = useQuery<FeatureDefinition[]>({
    queryKey: ['/api/features'],
  });

  // Load paint features (for the search feature)
  const { data: paintFeatures = [] } = useQuery({
    queryKey: ['/api/feature-sub-categories'],
  });

  // Process paint options for the search feature
  const allPaintOptions = paintFeatures.reduce((acc: any[], feature: any) => {
    if (feature.options && Array.isArray(feature.options)) {
      const optionsWithFeatureId = feature.options.map((option: any) => ({
        value: `${feature.id}:${option.value}`,
        label: `${feature.displayName || feature.name} - ${option.label}`,
        price: option.price || 0
      }));
      return [...acc, ...optionsWithFeatureId];
    }
    return acc;
  }, []);

  const filteredAllPaintOptions = allPaintOptions.filter((option: any) => {
    const searchTerm = paintQuery.toLowerCase();
    return option.label.toLowerCase().includes(searchTerm);
  });

  return (
    <div className="space-y-6">
      {/* Stock Model Selection */}
      <div className="space-y-2">
        <Label>Stock Model</Label>
        <Popover open={modelOpen} onOpenChange={setModelOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={modelOpen}
              className="w-full justify-between"
            >
              {modelId 
                ? modelOptions.find(model => model.id === modelId)?.displayName 
                : "Select model..."
              }
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Search models..." />
              <CommandEmpty>No models found.</CommandEmpty>
              <CommandGroup>
                <CommandList>
                  {modelOptions.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      onSelect={() => {
                        setModelId(model.id);
                        setModelOpen(false);
                      }}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span>{model.displayName}</span>
                        <span className="text-sm text-gray-500">
                          ${model.price.toFixed(2)}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandList>
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
        {errors.modelId && <p className="text-red-500 text-sm">{errors.modelId}</p>}
      </div>

      {/* Handedness Selection */}
      <div className="space-y-2">
        <Label>Handedness</Label>
        <Select value={handedness} onValueChange={setHandedness}>
          <SelectTrigger>
            <SelectValue placeholder="Select handedness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="right">Right</SelectItem>
            <SelectItem value="left">Left</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tikka Options */}
      {modelId && (
        <div className="space-y-2">
          <Label>Tikka Lug Options</Label>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="tikka-set"
                name="tikka-option"
                value="set"
                checked={tikkaOption === 'set'}
                onChange={(e) => setTikkaOption(e.target.value)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="tikka-set">Set</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="tikka-loose"
                name="tikka-option"
                value="loose"
                checked={tikkaOption === 'loose'}
                onChange={(e) => setTikkaOption(e.target.value)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="tikka-loose">Loose</Label>
            </div>
          </div>
        </div>
      )}

      {/* Custom Order Checkbox */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="custom-order"
            checked={isCustomOrder === 'yes'}
            onChange={(e) => setIsCustomOrder(e.target.checked ? 'yes' : '')}
            className="rounded border-gray-300"
          />
          <Label htmlFor="custom-order">Custom Order</Label>
        </div>
      </div>

      {/* Dynamic Features */}
      {featureDefs.map((featureDef) => (
        <div key={featureDef.id} className="space-y-2">
          <Label className="capitalize">{featureDef.name}</Label>
          {featureDef.type === 'dropdown' && (
            <Select
              value={features[featureDef.id] || ''}
              onValueChange={(value) => setFeatures(prev => ({ ...prev, [featureDef.id]: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {featureDef.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {featureDef.type === 'text' && (
            <Input
              value={features[featureDef.id] || ''}
              onChange={(e) => setFeatures(prev => ({ ...prev, [featureDef.id]: e.target.value }))}
              placeholder={`Enter ${featureDef.name.toLowerCase()}...`}
            />
          )}
          {featureDef.type === 'search' && featureDef.id === 'paint_options_combined' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {features[featureDef.id] 
                    ? allPaintOptions.find((option: any) => option.value === features[featureDef.id])?.label
                    : "Select paint option..."
                  }
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput 
                    placeholder="Search paint options..." 
                    value={paintQuery}
                    onValueChange={setPaintQuery}
                  />
                  <CommandEmpty>No paint options found.</CommandEmpty>
                  <CommandGroup>
                    <CommandList>
                      {filteredAllPaintOptions.map((option: any) => (
                        <CommandItem
                          key={option.value}
                          value={option.value}
                          onSelect={() => {
                            setFeatures(prev => ({ ...prev, [featureDef.id]: option.value }));
                            setPaintQuery('');
                          }}
                        >
                          <div className="flex justify-between items-center w-full">
                            <span>{option.label}</span>
                            {option.price > 0 && (
                              <span className="text-sm text-gray-500">
                                +${option.price.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          {featureDef.type === 'multiselect' && (
            <div className="space-y-2">
              {featureDef.options?.map((option) => {
                const selectedOptions = features[featureDef.id] || [];
                const isChecked = selectedOptions.includes(option.value);
                const quantity = featureQuantities[featureDef.id]?.[option.value] || 1;

                return (
                  <div key={option.value} className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`${featureDef.id}-${option.value}`}
                        checked={isChecked}
                        onChange={(e) => {
                          const currentSelection = features[featureDef.id] || [];
                          let newSelection;

                          if (e.target.checked) {
                            newSelection = [...currentSelection, option.value];
                            // Initialize quantity to 1 when first selected
                            setFeatureQuantities(prev => ({
                              ...prev,
                              [featureDef.id]: {
                                ...prev[featureDef.id],
                                [option.value]: 1
                              }
                            }));
                          } else {
                            newSelection = currentSelection.filter((val: string) => val !== option.value);
                            // Remove quantity when deselected
                            setFeatureQuantities(prev => {
                              const newQuantities = { ...prev };
                              if (newQuantities[featureDef.id]) {
                                delete newQuantities[featureDef.id][option.value];
                              }
                              return newQuantities;
                            });
                          }

                          setFeatures(prev => ({ ...prev, [featureDef.id]: newSelection }));
                        }}
                        className="rounded border-gray-300"
                      />
                      <label 
                        htmlFor={`${featureDef.id}-${option.value}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {option.label}
                        {option.price && option.price > 0 && (
                          <span className="text-blue-600 font-medium ml-2">
                            (+${option.price})
                          </span>
                        )}
                      </label>
                    </div>
                    {isChecked && (
                      <div className="flex items-center space-x-2 ml-6">
                        <Label htmlFor={`${featureDef.id}-${option.value}-qty`} className="text-xs text-gray-600">
                          Qty:
                        </Label>
                        <Input
                          type="number"
                          id={`${featureDef.id}-${option.value}-qty`}
                          min="1"
                          value={quantity}
                          onChange={(e) => {
                            const newQuantity = parseInt(e.target.value) || 1;
                            setFeatureQuantities(prev => ({
                              ...prev,
                              [featureDef.id]: {
                                ...prev[featureDef.id],
                                [option.value]: newQuantity
                              }
                            }));
                          }}
                          className="w-16 text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Conditional Shank Length Field */}
      {features.action === 'bartlein_#3b' && (
        <div className="space-y-2">
          <Label htmlFor="shankLength">Shank Length</Label>
          <Input
            id="shankLength"
            type="text"
            placeholder="Enter shank length..."
            value={shankLength}
            onChange={(e) => setShankLength(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}