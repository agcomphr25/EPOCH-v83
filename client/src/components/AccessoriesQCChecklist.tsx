import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertQcSubmissionSchema } from '@shared/schema';
import type { z as zodType } from 'zod';

interface AccessoriesQCChecklistProps {
  orderId: string;
  onSubmit?: (data: any) => void;
}

interface ExtraChargeItem {
  key: string;
  label: string;
  displayName: string;
  price: number;
  checked: boolean;
  category: 'accessory' | 'inlet' | 'miscellaneous';
}

// Form schema that includes all the checklist items plus notes
const accessoriesQCSchema = z.object({
  notes: z.string().optional(),
  checkedItems: z.record(z.string(), z.boolean()).default({})
});

type AccessoriesQCFormData = z.infer<typeof accessoriesQCSchema>;

export default function AccessoriesQCChecklist({ orderId, onSubmit }: AccessoriesQCChecklistProps) {
  const [extraChargeItems, setExtraChargeItems] = useState<ExtraChargeItem[]>([]);
  const { toast } = useToast();

  // Form setup with proper validation
  const form = useForm<AccessoriesQCFormData>({
    resolver: zodResolver(accessoriesQCSchema),
    defaultValues: {
      notes: '',
      checkedItems: {}
    }
  });

  // Fetch order data to get features
  const { data: orderData, isLoading: orderLoading } = useQuery({
    queryKey: ['/api/orders', orderId],
    queryFn: async () => {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) throw new Error('Failed to fetch order');
      return response.json();
    },
    enabled: !!orderId
  });

  // Fetch feature sub-categories to get pricing data
  const { data: featureSubCategories = [], isLoading: subCategoriesLoading } = useQuery({
    queryKey: ['/api/feature-sub-categories'],
    queryFn: async () => {
      const response = await fetch('/api/feature-sub-categories');
      if (!response.ok) throw new Error('Failed to fetch feature sub-categories');
      return response.json();
    }
  });

  // Fetch feature definitions to get bottom metal and other option pricing
  const { data: featureDefinitions = [], isLoading: featureDefsLoading } = useQuery({
    queryKey: ['/api/features'],
    queryFn: async () => {
      const response = await fetch('/api/features');
      if (!response.ok) throw new Error('Failed to fetch feature definitions');
      return response.json();
    }
  });

  // Process order features to identify actual extra charge accessories
  useEffect(() => {
    if (!orderData?.features || !featureSubCategories.length || !featureDefinitions.length) return;

    const items: ExtraChargeItem[] = [];
    const features = orderData.features;

    // Create comprehensive lookup maps for feature pricing
    const pricingByCode = new Map();
    
    featureSubCategories.forEach((subCat: any) => {
      if (subCat.price && subCat.price > 0) {
        const pricing = {
          price: subCat.price,
          displayName: subCat.displayName || subCat.name
        };
        
        // Map by all possible identifier patterns
        const identifiers = [
          subCat.id,
          subCat.name,
          subCat.displayName,
          subCat.code, // If schema has a code field
        ].filter(Boolean); // Remove null/undefined values
        
        identifiers.forEach(identifier => {
          if (identifier) {
            // Original identifier
            pricingByCode.set(identifier, pricing);
            
            // Normalized variations (underscore to dash, lowercase)
            const normalized = identifier.toString().replace(/_/g, '-').toLowerCase();
            pricingByCode.set(normalized, pricing);
            
            // Uppercase variation
            pricingByCode.set(identifier.toString().toUpperCase(), pricing);
          }
        });
      }
    });

    // Check bottom metal - ONLY include if it has confirmed extra charges (accessories)
    if (features.bottom_metal) {
      // Find bottom metal pricing from feature definitions
      const bottomMetalFeature = featureDefinitions.find((f: any) => f.id === 'bottom_metal' || f.name === 'bottom_metal');
      const bottomMetalOption = bottomMetalFeature?.options?.find((opt: any) => opt.value === features.bottom_metal);
      
      // Only add if we have confirmed pricing > 0
      if (bottomMetalOption && bottomMetalOption.price > 0) {
        items.push({
          key: `bottom_metal_${features.bottom_metal}`,
          label: features.bottom_metal,
          displayName: `Bottom Metal: ${bottomMetalOption.label}`,
          price: bottomMetalOption.price,
          checked: false,
          category: 'accessory'
        });
      }
      // If no pricing found or price is 0, do NOT include the item - requirement is only extra charges
    }

    // Check other options - ONLY include those with confirmed extra charges
    if (features.other_options && Array.isArray(features.other_options)) {
      features.other_options.forEach((option: string) => {
        // First try to find pricing in feature definitions
        let optionPrice = 0;
        let optionLabel = option;
        
        // Look through all feature definitions for this option
        for (const featureDef of featureDefinitions) {
          const foundOption = featureDef.options?.find((opt: any) => opt.value === option);
          if (foundOption && foundOption.price > 0) {
            optionPrice = foundOption.price;
            optionLabel = foundOption.label;
            break;
          }
        }
        
        // Fallback to feature sub-categories if not found in feature definitions
        if (optionPrice === 0) {
          const pricingInfo = pricingByCode.get(option);
          if (pricingInfo && pricingInfo.price > 0) {
            optionPrice = pricingInfo.price;
            optionLabel = pricingInfo.displayName;
          }
        }
        
        // Only add if we have confirmed pricing > 0
        if (optionPrice > 0) {
          items.push({
            key: `other_option_${option}`,
            label: option,
            displayName: optionLabel,
            price: optionPrice,
            checked: false,
            category: 'accessory'
          });
        }
        // If no pricing found, do NOT include the item - requirement is only extra charges
      });
    }

    // Check paint options - ONLY match exact paint option with confirmed pricing
    if (features.paint_options) {
      // Find exact match for the specific paint option selected
      let paintInfo = featureSubCategories.find((subCat: any) => 
        subCat.price > 0 && (
          subCat.id === features.paint_options ||
          subCat.name === features.paint_options
        )
      );
      
      // If no exact match, try the lookup map
      if (!paintInfo) {
        const pricingInfo = pricingByCode.get(features.paint_options);
        if (pricingInfo && pricingInfo.price > 0) {
          paintInfo = { price: pricingInfo.price, displayName: pricingInfo.displayName };
        }
      }
      
      // Only add if we have confirmed pricing > 0 for the exact paint option
      if (paintInfo && paintInfo.price > 0) {
        items.push({
          key: `paint_options_${features.paint_options}`,
          label: features.paint_options,
          displayName: `Paint: ${paintInfo.displayName || features.paint_options.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}`,
          price: paintInfo.price,
          checked: false,
          category: 'accessory'
        });
      }
      // If no exact pricing found, do NOT include the item - requirement is only extra charges
    }

    // Check miscellaneous items - these are always charged items
    if (features.miscItems && Array.isArray(features.miscItems)) {
      features.miscItems.forEach((miscItem: any, index: number) => {
        if (miscItem.unitPrice && miscItem.unitPrice > 0) {
          items.push({
            key: `misc_item_${miscItem.id || index}`,
            label: miscItem.description || `Misc Item ${index + 1}`,
            displayName: `${miscItem.description || `Misc Item ${index + 1}`} (Qty: ${miscItem.quantity})`,
            price: miscItem.total || (miscItem.quantity * miscItem.unitPrice),
            checked: false,
            category: 'miscellaneous'
          });
        }
      });
    }

    // Check action inlet - categorize under inlet
    if (features.action_inlet) {
      // Find action inlet pricing from feature definitions
      const actionInletFeature = featureDefinitions.find((f: any) => f.id === 'action_inlet' || f.name === 'action_inlet');
      const actionInletOption = actionInletFeature?.options?.find((opt: any) => opt.value === features.action_inlet);
      
      // Only add if we have confirmed pricing > 0
      if (actionInletOption && actionInletOption.price > 0) {
        items.push({
          key: `action_inlet_${features.action_inlet}`,
          label: features.action_inlet,
          displayName: `Action Inlet: ${actionInletOption.label}`,
          price: actionInletOption.price,
          checked: false,
          category: 'inlet'
        });
      }
    }

    // Check barrel inlet - categorize under inlet
    if (features.barrel_inlet) {
      // Find barrel inlet pricing from feature definitions
      const barrelInletFeature = featureDefinitions.find((f: any) => f.id === 'barrel_inlet' || f.name === 'barrel_inlet');
      const barrelInletOption = barrelInletFeature?.options?.find((opt: any) => opt.value === features.barrel_inlet);
      
      // Only add if we have confirmed pricing > 0
      if (barrelInletOption && barrelInletOption.price > 0) {
        items.push({
          key: `barrel_inlet_${features.barrel_inlet}`,
          label: features.barrel_inlet,
          displayName: `Barrel Inlet: ${barrelInletOption.label}`,
          price: barrelInletOption.price,
          checked: false,
          category: 'inlet'
        });
      }
    }

    setExtraChargeItems(items);

    // Initialize form with the items
    const initialCheckedItems: Record<string, boolean> = {};
    items.forEach(item => {
      initialCheckedItems[item.key] = false;
    });
    form.setValue('checkedItems', initialCheckedItems);
  }, [orderData, featureSubCategories, featureDefinitions, form]);

  // Submit QC checklist using proper schema and apiRequest
  const submitMutation = useMutation({
    mutationFn: async (formData: AccessoriesQCFormData) => {
      const checkedItems = formData.checkedItems;
      const allItemsChecked = extraChargeItems.every(item => checkedItems[item.key] === true);

      const qcSubmissionData = {
        orderId,
        line: 'P1',
        department: 'Accessories',
        sku: orderData?.modelId || '',
        final: false,
        data: {
          extraChargeItems: extraChargeItems.map(item => ({
            key: item.key,
            label: item.label,
            displayName: item.displayName,
            price: item.price,
            checked: checkedItems[item.key] || false
          })),
          notes: formData.notes || '',
          completedAt: new Date().toISOString(),
          itemCount: extraChargeItems.length,
          checkedCount: extraChargeItems.filter(item => checkedItems[item.key] === true).length
        },
        status: 'pending' as const, // Use proper enum value
        summary: allItemsChecked ? 'PASS' : null, // Only set to PASS if all checked
        submittedBy: 'QC Inspector'
      };

      // Validate against the actual schema before submitting
      const validatedData = insertQcSubmissionSchema.parse(qcSubmissionData);
      return apiRequest('/api/qc-submissions', {
        method: 'POST',
        body: validatedData
      });
    },
    onSuccess: (data) => {
      toast({ title: 'Accessories QC Checklist submitted successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/qc-submissions'] });
      form.reset();
      onSubmit?.(data);
    },
    onError: (error) => {
      console.error('QC submission error:', error);
      toast({ 
        title: 'Error submitting QC checklist', 
        description: error instanceof Error ? error.message : 'Unknown error', 
        variant: 'destructive' 
      });
    }
  });

  const onFormSubmit = (data: AccessoriesQCFormData) => {
    submitMutation.mutate(data);
  };

  const checkedItems = form.watch('checkedItems');
  const allItemsChecked = extraChargeItems.length > 0 && 
    extraChargeItems.every(item => checkedItems[item.key] === true);

  if (orderLoading || subCategoriesLoading || featureDefsLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-accessories-qc-checklist">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Accessories QC Checklist - Order #{orderId}
        </CardTitle>
        {orderData && (
          <div className="text-sm text-gray-600" data-testid="text-order-details">
            Model: {orderData.modelId} | Customer: {orderData.customerId}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {extraChargeItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p data-testid="text-no-extra-charges">No extra charge accessories found for this order</p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-6">
              <div className="space-y-6">
                {/* Group items by category */}
                {['accessory', 'inlet', 'miscellaneous'].map(category => {
                  const categoryItems = extraChargeItems.filter(item => item.category === category);
                  if (categoryItems.length === 0) return null;
                  
                  const categoryTitle = {
                    accessory: 'Accessories (Extra Charge)',
                    inlet: 'Inlet (Extra Charge)', 
                    miscellaneous: 'Miscellaneous Items'
                  }[category];
                  
                  return (
                    <div key={category} className="space-y-3">
                      <h3 className="font-semibold text-lg border-b pb-2">{categoryTitle}:</h3>
                      {categoryItems.map((item) => (
                        <div key={item.key} className="flex items-start space-x-3 p-3 border rounded-lg">
                          <FormField
                            control={form.control}
                            name={`checkedItems.${item.key}`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    data-testid={`checkbox-${item.key}`}
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="mt-1"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel 
                                    className="text-sm font-medium cursor-pointer"
                                    data-testid={`label-${item.key}`}
                                  >
                                    {item.displayName}
                                  </FormLabel>
                                  <Badge variant="outline" className="ml-2" data-testid={`badge-price-${item.key}`}>
                                    ${item.price}
                                  </Badge>
                                </div>
                                <div className="ml-auto">
                                  {field.value ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" data-testid={`icon-pass-${item.key}`} />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-red-500" data-testid={`icon-fail-${item.key}`} />
                                  )}
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>QC Notes (if any)</FormLabel>
                    <FormControl>
                      <Textarea
                        data-testid="textarea-notes"
                        placeholder="Enter any QC notes, issues, or observations..."
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Status: {allItemsChecked ? (
                    <Badge className="bg-green-100 text-green-800" data-testid="badge-status-pass">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      PASS
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-100 text-yellow-800" data-testid="badge-status-pending">
                      <XCircle className="h-3 w-3 mr-1" />
                      PENDING
                    </Badge>
                  )}
                </div>
                
                <Button
                  type="submit"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-checklist"
                >
                  {submitMutation.isPending ? 'Submitting...' : 'Submit QC Checklist'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}