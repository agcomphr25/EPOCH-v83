import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  FileText,
  Plus,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  DRAFT: { label: "Draft", variant: "secondary", icon: <FileText className="h-3 w-3" /> },
  NEEDS_REVIEW: { label: "Needs Review", variant: "destructive", icon: <AlertCircle className="h-3 w-3" /> },
  CONFIRMED: { label: "Ready to Add", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
  POSTED: { label: "Added to Weekly Timesheet", variant: "outline", icon: <CheckCircle2 className="h-3 w-3" /> },
  VOIDED: { label: "Voided", variant: "destructive", icon: <AlertCircle className="h-3 w-3" /> },
};

type LaborEntryDraft = {
  id: number;
  entryDate: string;
  status: string;
  totalHours: string | null;
  parsedSegmentsJson: any[];
  createdAt: string;
  updatedAt: string;
};

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export default function SalariedDraftListPage() {
  const { portalId } = useParams<{ portalId: string }>();
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date().toISOString().slice(0, 10)));
  const weekEnd = addDays(weekStart, 6);

  const { data: featureFlag, isLoading: flagLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/timekeeping/labor-entry-drafts/feature-enabled'],
    staleTime: 5 * 60 * 1000,
  });

  const listBaseKey = `/api/timekeeping/labor-entry-drafts/portal/${portalId}`;

  const { data: drafts = [], isLoading } = useQuery<LaborEntryDraft[]>({
    queryKey: [listBaseKey, { from: weekStart, to: weekEnd }],
    queryFn: () => apiRequest(`${listBaseKey}?from=${weekStart}&to=${weekEnd}`),
    enabled: featureFlag?.enabled === true,
  });

  function prevWeek() {
    setWeekStart((w) => addDays(w, -7));
  }

  function nextWeek() {
    setWeekStart((w) => addDays(w, 7));
  }

  const totalThisWeek = drafts.reduce((sum, d) => sum + parseFloat(d.totalHours ?? "0"), 0);

  const weekLabel = (() => {
    const from = new Date(weekStart + "T00:00:00");
    const to = new Date(weekEnd + "T00:00:00");
    const sameMo = from.getMonth() === to.getMonth();
    const monthFmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (sameMo) {
      return `${from.toLocaleDateString(undefined, { month: "short" })} ${from.getDate()}–${to.getDate()}, ${to.getFullYear()}`;
    }
    return `${monthFmt(from)} – ${monthFmt(to)}, ${to.getFullYear()}`;
  })();

  if (flagLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!featureFlag?.enabled) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Link href={`/employee-portal/${portalId}`}>
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to portal
          </Button>
        </Link>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Feature not available</AlertTitle>
          <AlertDescription>
            Manual time entry for salaried employees is not currently enabled.
            Please contact your administrator for access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/employee-portal/${portalId}`}>
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to portal
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">My Time Entries</h1>
            <p className="text-sm text-muted-foreground">Salaried manual time entry drafts</p>
          </div>
        </div>
        <Link href={`/employee-portal/${portalId}/time-entry`}>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New entry
          </Button>
        </Link>
      </div>

      <Alert>
        <AlertDescription>
          Daily entries are a convenient way to build your time. They must still be added to and
          certified on the weekly timesheet, which is the controlled record sent to your supervisor
          and payroll for approval.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Week of {weekLabel}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4 text-sm">
            <span className="text-muted-foreground">
              {drafts.length} {drafts.length === 1 ? "entry" : "entries"} this week
            </span>
            <span className="font-medium">
              Total: {fmtHours(totalThisWeek)}
            </span>
          </div>

          <Separator className="mb-4" />

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground space-y-3">
              <FileText className="h-8 w-8 mx-auto opacity-40" />
              <p className="text-sm">No time entries for this week.</p>
              <Link href={`/employee-portal/${portalId}/time-entry`}>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Create your first entry
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => {
                const status = draft.status;
                const badge = STATUS_BADGE[status] ?? STATUS_BADGE["DRAFT"]!;
                const hours = parseFloat(draft.totalHours ?? "0");
                const segCount = (draft.parsedSegmentsJson ?? []).length;

                return (
                  <Link key={draft.id} href={`/employee-portal/${portalId}/time-entry/${draft.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="space-y-0.5">
                          <div className="font-medium text-sm">{fmtDate(draft.entryDate)}</div>
                          <div className="text-xs text-muted-foreground">
                            {segCount} {segCount === 1 ? "segment" : "segments"}
                            {hours > 0 ? ` · ${fmtHours(hours)}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={badge.variant} className="text-xs flex items-center gap-1">
                          {badge.icon}
                          {badge.label}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-center">
        DRAFT = saved but not submitted · NEEDS REVIEW = has errors · READY TO SUBMIT = validated · SUBMITTED = posted to payroll
      </div>
    </div>
  );
}
