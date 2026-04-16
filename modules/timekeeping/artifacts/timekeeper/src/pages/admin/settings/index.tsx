import { AdminLayout } from "@/components/layout/admin-layout";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminSettings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        data: {
          companyName: formData.companyName,
          timezone: formData.timezone,
          overtimeThresholdDaily: Number(formData.overtimeThresholdDaily),
          overtimeThresholdWeekly: Number(formData.overtimeThresholdWeekly),
          roundingRuleMinutes: Number(formData.roundingRuleMinutes),
          breakDurationMinutes: Number(formData.breakDurationMinutes),
          requireBreakAfterHours: Number(formData.requireBreakAfterHours),
          standardWorkWeekHours: Number(formData.standardWorkWeekHours),
          kioskRequirePin: formData.kioskRequirePin,
          kioskTimeoutSeconds: Number(formData.kioskTimeoutSeconds),
          kioskMessage: formData.kioskMessage,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast.success("Settings updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update settings");
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <Button onClick={handleSave} disabled={updateSettings.isPending}>Save Changes</Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading settings...</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Company and regional settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input 
                  value={formData.companyName || ''} 
                  onChange={e => handleChange('companyName', e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input 
                  value={formData.timezone || ''} 
                  onChange={e => handleChange('timezone', e.target.value)} 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Time Rules</CardTitle>
              <CardDescription>Overtime and rounding policies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Daily Overtime (Hours)</Label>
                  <Input 
                    type="number"
                    value={formData.overtimeThresholdDaily || 0} 
                    onChange={e => handleChange('overtimeThresholdDaily', e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Weekly Overtime (Hours)</Label>
                  <Input 
                    type="number"
                    value={formData.overtimeThresholdWeekly || 0} 
                    onChange={e => handleChange('overtimeThresholdWeekly', e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rounding Rule (Minutes)</Label>
                  <Input 
                    type="number"
                    value={formData.roundingRuleMinutes || 0} 
                    onChange={e => handleChange('roundingRuleMinutes', e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Standard Work Week (Hours)</Label>
                  <Input 
                    type="number"
                    value={formData.standardWorkWeekHours || 40} 
                    onChange={e => handleChange('standardWorkWeekHours', e.target.value)} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Breaks</CardTitle>
              <CardDescription>Mandatory break settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Break Duration (Minutes)</Label>
                  <Input 
                    type="number"
                    value={formData.breakDurationMinutes || 0} 
                    onChange={e => handleChange('breakDurationMinutes', e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Require After (Hours)</Label>
                  <Input 
                    type="number"
                    value={formData.requireBreakAfterHours || 0} 
                    onChange={e => handleChange('requireBreakAfterHours', e.target.value)} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kiosk</CardTitle>
              <CardDescription>Terminal specific settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require PIN</Label>
                  <p className="text-sm text-muted-foreground">Require employees to enter PIN when punching</p>
                </div>
                <Switch 
                  checked={formData.kioskRequirePin || false}
                  onCheckedChange={checked => handleChange('kioskRequirePin', checked)}
                />
              </div>
              <div className="space-y-2">
                <Label>Idle Timeout (Seconds)</Label>
                <Input
                  type="number"
                  min={10}
                  max={600}
                  value={formData.kioskTimeoutSeconds ?? 60}
                  onChange={e => handleChange('kioskTimeoutSeconds', e.target.value)}
                  placeholder="60"
                />
                <p className="text-xs text-muted-foreground">Auto-reset kiosk after this many seconds of inactivity</p>
              </div>
              <div className="space-y-2">
                <Label>Kiosk Message</Label>
                <Input 
                  value={formData.kioskMessage || ''} 
                  onChange={e => handleChange('kioskMessage', e.target.value)} 
                  placeholder="Message displayed at bottom of kiosk screen"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}
