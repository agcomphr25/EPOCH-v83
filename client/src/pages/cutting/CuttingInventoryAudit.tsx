import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, AlertTriangle, CheckCircle2, Info } from "lucide-react";

type AuditPacket = {
  id: number;
  agPartNumber: string;
  name: string;
  systemQty: number;
  lastAuditRecord: {
    auditDate: string;
    actualQty: number;
    variance: number;
    auditedBy: string | null;
  } | null;
};

type AuditSettings = {
  id: number;
  frequency: "daily" | "weekly" | "bi_weekly" | "monthly";
  nextAuditDate: string | null;
  lastAuditDate: string | null;
};

type CurrentUser = { username: string };

function getAuditStatus(settings: AuditSettings | null): "overdue" | "due_soon" | "ok" | "never" {
  if (!settings || !settings.nextAuditDate) return "never";
  const next = new Date(settings.nextAuditDate);
  const now = new Date();
  const diff = next.getTime() - now.getTime();
  if (diff <= 0) return "overdue";
  if (diff <= 24 * 60 * 60 * 1000) return "due_soon";
  return "ok";
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatFrequency(f: string): string {
  const map: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    bi_weekly: "Bi-Weekly",
    monthly: "Monthly",
  };
  return map[f] ?? f;
}

function VarianceBadge({ variance, systemQty }: { variance: number; systemQty: number }) {
  if (variance === 0) {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Match</Badge>;
  }
  const pct = systemQty === 0 ? Math.abs(variance) * 100 : (Math.abs(variance) / systemQty) * 100;
  const label = variance > 0 ? `+${variance}` : `${variance}`;
  if (pct <= 5) {
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">{label}</Badge>;
  }
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">{label}</Badge>;
}

export default function CuttingInventoryAudit() {
  const { toast } = useToast();
  const [actuals, setActuals] = useState<Record<number, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    frequency: "weekly" as AuditSettings["frequency"],
    nextAuditDate: "",
  });

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["currentUser"],
  });

  const { data: packets = [], isLoading: loadingPackets } = useQuery<AuditPacket[]>({
    queryKey: ["/api/cutting-table/inventory-audit/packets"],
  });

  const { data: settings = null } = useQuery<AuditSettings | null>({
    queryKey: ["/api/cutting-table/inventory-audit/settings"],
  });

  const auditStatus = getAuditStatus(settings);

  const handleActualChange = useCallback((id: number, val: string) => {
    setActuals((prev) => ({ ...prev, [id]: val }));
  }, []);

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: { frequency: string; nextAuditDate?: string }) => {
      return apiRequest("/api/cutting-table/inventory-audit/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cutting-table/inventory-audit/settings"] });
      toast({ title: "Settings saved", description: "Audit schedule has been updated." });
      setSettingsOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const submitAuditMutation = useMutation({
    mutationFn: async (entries: { packetId: number; actualQty: number }[]) => {
      return apiRequest("/api/cutting-table/inventory-audit/submit", {
        method: "POST",
        body: JSON.stringify({ entries, auditedBy: currentUser?.username ?? "" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cutting-table/inventory-audit/packets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cutting-table/inventory-audit/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cutting-table/stock-levels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cutting-table/weekly-cutting-queue"] });
      toast({ title: "Audit saved", description: "Actuals recorded and on-hand quantities updated." });
      setActuals({});
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit audit.", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const entries = packets
      .filter((p) => actuals[p.id] !== undefined && actuals[p.id] !== "")
      .map((p) => ({
        packetId: p.id,
        actualQty: parseInt(actuals[p.id] ?? "0", 10),
      }))
      .filter((e) => !isNaN(e.actualQty));

    if (entries.length === 0) {
      toast({ title: "Nothing to submit", description: "Enter at least one actual quantity.", variant: "destructive" });
      return;
    }
    submitAuditMutation.mutate(entries);
  };

  const openSettings = () => {
    setSettingsForm({
      frequency: settings?.frequency ?? "weekly",
      nextAuditDate: settings?.nextAuditDate
        ? new Date(settings.nextAuditDate).toISOString().split("T")[0]
        : "",
    });
    setSettingsOpen(true);
  };

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate({
      frequency: settingsForm.frequency,
      nextAuditDate: settingsForm.nextAuditDate || undefined,
    });
  };

  const anyEntered = packets.some((p) => actuals[p.id] !== undefined && actuals[p.id] !== "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Packet Inventory Audit</h2>
            {auditStatus === "overdue" && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 gap-1">
                <AlertTriangle className="h-3 w-3" />Overdue
              </Badge>
            )}
            {auditStatus === "due_soon" && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200 gap-1">
                <AlertTriangle className="h-3 w-3" />Due Soon
              </Badge>
            )}
            {auditStatus === "ok" && settings?.nextAuditDate && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 gap-1">
                <CheckCircle2 className="h-3 w-3" />Next: {formatDate(settings.nextAuditDate)}
              </Badge>
            )}
            {auditStatus === "never" && (
              <Badge variant="secondary" className="gap-1">
                <Info className="h-3 w-3" />Not scheduled
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Enter physical counts below. Saving updates on-hand quantities on the demand cards.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={openSettings} className="gap-1 shrink-0">
          <Settings className="h-4 w-4" />
          Schedule
        </Button>
      </div>

      {settings && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>
            Frequency:{" "}
            <span className="font-medium text-foreground">{formatFrequency(settings.frequency)}</span>
          </span>
          {settings.lastAuditDate && (
            <span>
              Last audited:{" "}
              <span className="font-medium text-foreground">{formatDate(settings.lastAuditDate)}</span>
            </span>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Packet Inventory</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingPackets ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading packets…</div>
          ) : packets.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No packet inventory items found. Mark inventory items as packets in the Inventory Manager to begin auditing.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">System Qty</TableHead>
                  <TableHead className="text-right">Actual Qty</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Last Audited</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packets.map((packet) => {
                  const rawVal = actuals[packet.id];
                  const hasEntry = rawVal !== undefined && rawVal !== "";
                  const actualNum = hasEntry ? parseInt(rawVal, 10) : NaN;
                  const variance = !isNaN(actualNum) ? actualNum - packet.systemQty : null;

                  return (
                    <TableRow key={packet.id}>
                      <TableCell className="font-mono text-xs">{packet.agPartNumber}</TableCell>
                      <TableCell className="font-medium">{packet.name}</TableCell>
                      <TableCell className="text-right font-mono">{packet.systemQty}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={rawVal ?? ""}
                          onChange={(e) => handleActualChange(packet.id, e.target.value)}
                          placeholder={String(packet.systemQty)}
                          className="w-24 ml-auto text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {variance !== null ? (
                          <VarianceBadge variance={variance} systemQty={packet.systemQty} />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {packet.lastAuditRecord
                          ? formatDate(packet.lastAuditRecord.auditDate)
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {packets.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!anyEntered || submitAuditMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {submitAuditMutation.isPending ? "Saving…" : "Save Audit"}
          </Button>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Audit Schedule Settings</DialogTitle>
            <DialogDescription>
              Configure how often packet inventory audits should occur and when the next one is due.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Audit Frequency</Label>
              <Select
                value={settingsForm.frequency}
                onValueChange={(val) =>
                  setSettingsForm((prev) => ({ ...prev, frequency: val as AuditSettings["frequency"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Next Audit Date (optional override)</Label>
              <Input
                type="date"
                value={settingsForm.nextAuditDate}
                onChange={(e) =>
                  setSettingsForm((prev) => ({ ...prev, nextAuditDate: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to auto-calculate from frequency.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={saveSettingsMutation.isPending}>
              {saveSettingsMutation.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
