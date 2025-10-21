import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { CheckCircle2, XCircle, Mail, Calendar, FileText, HardDrive, Sheet } from 'lucide-react';

interface UserIntegration {
  id: number;
  userId: number;
  integrationType: string;
  isConnected: boolean;
  accountEmail?: string;
  accountName?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const integrationConfigs = [
  {
    type: 'google-gmail',
    name: 'Gmail',
    description: 'Connect your Gmail account to manage emails',
    icon: Mail,
    color: 'text-red-500',
  },
  {
    type: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync your calendar events',
    icon: Calendar,
    color: 'text-blue-500',
  },
  {
    type: 'google-drive',
    name: 'Google Drive',
    description: 'Access your files and documents',
    icon: HardDrive,
    color: 'text-green-500',
  },
  {
    type: 'google-sheets',
    name: 'Google Sheets',
    description: 'Manage your spreadsheets',
    icon: Sheet,
    color: 'text-emerald-500',
  },
  {
    type: 'outlook',
    name: 'Outlook',
    description: 'Connect your Outlook email and calendar',
    icon: Mail,
    color: 'text-blue-600',
  },
];

export default function Settings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('integrations');

  const { data: integrations = [], isLoading } = useQuery<UserIntegration[]>({
    queryKey: ['/api/user-integrations'],
  });

  const disconnectMutation = useMutation({
    mutationFn: async (integrationType: string) => {
      return apiRequest(`/api/user-integrations/${integrationType}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-integrations'] });
      toast({
        title: 'Success',
        description: 'Integration disconnected successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to disconnect integration',
        variant: 'destructive',
      });
    },
  });

  const getIntegrationStatus = (type: string) => {
    const integration = integrations.find((i) => i.integrationType === type);
    return integration?.isConnected || false;
  };

  const getIntegrationData = (type: string) => {
    return integrations.find((i) => i.integrationType === type);
  };

  const handleConnect = (type: string) => {
    // Determine OAuth provider based on integration type
    let oauthProvider = '';
    if (type.startsWith('google-')) {
      oauthProvider = 'google';
    } else if (type === 'outlook') {
      oauthProvider = 'microsoft';
    }

    if (!oauthProvider) {
      toast({
        title: 'Error',
        description: 'Unknown integration type',
        variant: 'destructive',
      });
      return;
    }

    // Open OAuth popup window
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      `/api/oauth/${oauthProvider}/initiate?type=${type}`,
      'OAuth Authentication',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      toast({
        title: 'Error',
        description: 'Please allow popups for this site',
        variant: 'destructive',
      });
      return;
    }

    // Listen for OAuth callback messages
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      const allowedOrigin = window.location.origin;
      if (event.origin !== allowedOrigin) {
        console.warn('Received message from unauthorized origin:', event.origin);
        return;
      }

      if (event.data.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/user-integrations'] });
        toast({
          title: 'Success',
          description: `Successfully connected ${event.data.accountEmail}`,
        });
        window.removeEventListener('message', handleMessage);
      } else if (event.data.error) {
        toast({
          title: 'Error',
          description: event.data.error,
          variant: 'destructive',
        });
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);

    // Clean up if popup is closed without completing OAuth
    const checkPopup = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkPopup);
        window.removeEventListener('message', handleMessage);
      }
    }, 500);
  };

  const handleDisconnect = (type: string) => {
    disconnectMutation.mutate(type);
  };

  return (
    <div className="min-h-screen bg-background dark:bg-gray-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground dark:text-white mb-2">Settings</h1>
          <p className="text-muted-foreground dark:text-gray-400">
            Manage your account settings and integrations
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              Integrations
            </TabsTrigger>
            <TabsTrigger value="account" data-testid="tab-account">
              Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-foreground dark:text-white mb-2">
                Connected Services
              </h2>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Connect your Google and Outlook accounts to sync data across services
              </p>
            </div>

            {isLoading ? (
              <div className="text-center py-8">Loading integrations...</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {integrationConfigs.map((config) => {
                  const isConnected = getIntegrationStatus(config.type);
                  const integrationData = getIntegrationData(config.type);
                  const Icon = config.icon;

                  return (
                    <Card key={config.type} className="dark:bg-gray-900 dark:border-gray-800" data-testid={`card-integration-${config.type}`}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Icon className={`h-8 w-8 ${config.color}`} />
                            <div>
                              <CardTitle className="text-lg dark:text-white">{config.name}</CardTitle>
                              <CardDescription className="dark:text-gray-400">
                                {config.description}
                              </CardDescription>
                            </div>
                          </div>
                          {isConnected ? (
                            <Badge variant="default" className="bg-green-500 dark:bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Connected
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="dark:bg-gray-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              Not Connected
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {isConnected && integrationData ? (
                          <div className="space-y-3">
                            {integrationData.accountEmail && (
                              <div className="text-sm">
                                <span className="font-medium dark:text-gray-300">Account: </span>
                                <span className="text-muted-foreground dark:text-gray-400" data-testid={`text-account-${config.type}`}>
                                  {integrationData.accountEmail}
                                </span>
                              </div>
                            )}
                            {integrationData.lastSyncedAt && (
                              <div className="text-sm">
                                <span className="font-medium dark:text-gray-300">Last synced: </span>
                                <span className="text-muted-foreground dark:text-gray-400">
                                  {new Date(integrationData.lastSyncedAt).toLocaleString()}
                                </span>
                              </div>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDisconnect(config.type)}
                              disabled={disconnectMutation.isPending}
                              className="w-full dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-white"
                              data-testid={`button-disconnect-${config.type}`}
                            >
                              Disconnect
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={() => handleConnect(config.type)}
                            className="w-full"
                            data-testid={`button-connect-${config.type}`}
                          >
                            Connect {config.name}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="account" className="space-y-6">
            <Card className="dark:bg-gray-900 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="dark:text-white">Account Settings</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Manage your account preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground dark:text-gray-400">
                  Additional account settings coming soon...
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
