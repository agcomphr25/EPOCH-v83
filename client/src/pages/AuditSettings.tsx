import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Factory, 
  DollarSign, 
  Truck, 
  Users, 
  CheckCircle, 
  Package,
  Shield,
  Settings,
  Info
} from 'lucide-react';

interface AuditSetting {
  id: number;
  category: string;
  eventType: string;
  displayName: string;
  description: string | null;
  isEnabled: boolean;
  isCritical: boolean;
  appliesTo: string;
  sortOrder: number;
}

const categoryConfig: Record<string, { label: string; icon: any; description: string }> = {
  production: {
    label: 'Production',
    icon: Factory,
    description: 'Order creation, department changes, status updates, and production workflow events',
  },
  finance: {
    label: 'Finance',
    icon: DollarSign,
    description: 'Payments, refunds, pricing changes, and financial transactions',
  },
  shipping: {
    label: 'Shipping',
    icon: Truck,
    description: 'Tracking numbers, shipment notifications, and delivery confirmations',
  },
  customer: {
    label: 'Customer',
    icon: Users,
    description: 'Customer communications, notes, and notification events',
  },
  qc: {
    label: 'Quality Control',
    icon: CheckCircle,
    description: 'QC inspections, pass/fail results, and quality-related events',
  },
  p2: {
    label: 'P2 Items',
    icon: Package,
    description: 'P2 purchase orders, serialized items, project tracking, and traceability',
  },
};

export default function AuditSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: settings = [], isLoading } = useQuery<AuditSetting[]>({
    queryKey: ['/api/audit/settings'],
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ eventType, isEnabled }: { eventType: string; isEnabled: boolean }) => {
      return apiRequest(`/api/audit/settings/${eventType}`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audit/settings'] });
      toast({
        title: 'Setting Updated',
        description: 'Audit setting has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update audit setting',
        variant: 'destructive',
      });
    },
  });

  const handleToggle = (eventType: string, currentValue: boolean, isCritical: boolean) => {
    if (isCritical) {
      toast({
        title: 'Cannot Disable',
        description: 'Critical events cannot be disabled for compliance reasons.',
        variant: 'destructive',
      });
      return;
    }
    updateSettingMutation.mutate({ eventType, isEnabled: !currentValue });
  };

  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, AuditSetting[]>);

  const filteredSettings = activeTab === 'all' 
    ? groupedSettings 
    : activeTab === 'p1'
    ? Object.entries(groupedSettings).reduce((acc, [key, items]) => {
        const filtered = items.filter(s => s.appliesTo === 'p1' || s.appliesTo === 'both');
        if (filtered.length > 0) acc[key] = filtered;
        return acc;
      }, {} as Record<string, AuditSetting[]>)
    : Object.entries(groupedSettings).reduce((acc, [key, items]) => {
        const filtered = items.filter(s => s.appliesTo === 'p2' || s.appliesTo === 'both');
        if (filtered.length > 0) acc[key] = filtered;
        return acc;
      }, {} as Record<string, AuditSetting[]>);

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Audit Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure which events are tracked in the audit log
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Event Tracking Configuration
          </CardTitle>
          <CardDescription>
            Enable or disable tracking for specific event types. Critical events (marked with a badge) 
            cannot be disabled for compliance and traceability requirements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="all">All Events</TabsTrigger>
              <TabsTrigger value="p1">P1 Orders</TabsTrigger>
              <TabsTrigger value="p2">P2 Items</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              <Accordion type="multiple" defaultValue={Object.keys(filteredSettings)} className="w-full">
                {Object.entries(filteredSettings).map(([category, categorySettings]) => {
                  const config = categoryConfig[category] || {
                    label: category,
                    icon: Info,
                    description: '',
                  };
                  const Icon = config.icon;

                  return (
                    <AccordionItem key={category} value={category}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-primary" />
                          <div className="text-left">
                            <div className="font-semibold">{config.label}</div>
                            <div className="text-sm text-muted-foreground font-normal">
                              {config.description}
                            </div>
                          </div>
                          <Badge variant="outline" className="ml-2">
                            {categorySettings.length} events
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-4">
                          {categorySettings
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((setting) => (
                              <div
                                key={setting.eventType}
                                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                                data-testid={`setting-${setting.eventType}`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{setting.displayName}</span>
                                    {setting.isCritical && (
                                      <Badge variant="default" className="bg-red-500">
                                        Critical
                                      </Badge>
                                    )}
                                    {setting.appliesTo !== 'both' && (
                                      <Badge variant="outline">
                                        {setting.appliesTo.toUpperCase()}
                                      </Badge>
                                    )}
                                  </div>
                                  {setting.description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {setting.description}
                                    </p>
                                  )}
                                </div>
                                <Switch
                                  checked={setting.isEnabled}
                                  onCheckedChange={() =>
                                    handleToggle(setting.eventType, setting.isEnabled, setting.isCritical)
                                  }
                                  disabled={setting.isCritical || updateSettingMutation.isPending}
                                  data-testid={`toggle-${setting.eventType}`}
                                />
                              </div>
                            ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
