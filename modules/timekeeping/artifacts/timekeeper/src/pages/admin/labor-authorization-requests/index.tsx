import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type AuthRequest = {
  id: number;
  laborAuthorizationId: number;
  requestedBy: number;
  requestedHours: number;
  reason: string;
  status: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function statusBadge(status: string) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
  if (status === "denied") return <Badge className="bg-red-100 text-red-800 border-red-200">Denied</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>;
}

export default function LaborAuthorizationRequests() {
  const qc = useQueryClient();
  const [reviewDialog, setReviewDialog] = useState<{ id: number; action: "approve" | "deny" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data: requests = [], isLoading } = useQuery<AuthRequest[]>({
    queryKey: ["/api/labor/authorization-requests"],
    queryFn: () => apiFetch("/api/labor/authorization-requests"),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, action, note }: { id: number; action: "approve" | "deny"; note: string }) =>
      apiFetch(`/api/labor/authorization-requests/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNote: note || undefined }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/labor/authorization-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/labor/authorizations"] });
      toast.success(vars.action === "approve" ? "Request approved" : "Request denied");
      setReviewDialog(null);
      setReviewNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleReview = () => {
    if (!reviewDialog) return;
    reviewMut.mutate({ id: reviewDialog.id, action: reviewDialog.action, note: reviewNote });
  };

  const pending = requests.filter(r => r.status === "pending");
  const reviewed = requests.filter(r => r.status !== "pending");

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Extra-Hours Requests</h1>
        <p className="text-muted-foreground mt-1">Review and approve or deny employee requests for additional authorized hours</p>
      </div>

      {pending.length > 0 && (
        <Card className="mb-6 border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-bold">{pending.length}</span>
              Pending Review
            </CardTitle>
            <CardDescription>These requests are waiting for your decision</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Authorization ID</TableHead>
                  <TableHead>Requested By (Employee ID)</TableHead>
                  <TableHead>Hours Requested</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map(req => (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono">#{req.laborAuthorizationId}</TableCell>
                    <TableCell>Employee #{req.requestedBy}</TableCell>
                    <TableCell className="font-semibold">{req.requestedHours.toFixed(1)}h</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{req.reason}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(req.createdAt), "PP")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => { setReviewDialog({ id: req.id, action: "approve" }); setReviewNote(""); }}>
                          <CheckCircle className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-red-700 border-red-300 hover:bg-red-50"
                          onClick={() => { setReviewDialog({ id: req.id, action: "deny" }); setReviewNote(""); }}>
                          <XCircle className="h-3.5 w-3.5" /> Deny
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Requests</CardTitle>
          <CardDescription>History of all extra-hours authorization requests</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Authorization ID</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Review Note</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No extra-hours requests found.</TableCell></TableRow>
              ) : requests.map(req => (
                <TableRow key={req.id}>
                  <TableCell className="font-mono">#{req.laborAuthorizationId}</TableCell>
                  <TableCell>#{req.requestedBy}</TableCell>
                  <TableCell className="font-semibold">{req.requestedHours.toFixed(1)}h</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground text-sm">{req.reason}</TableCell>
                  <TableCell>{statusBadge(req.status)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{req.reviewNote || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(req.createdAt), "PP")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={reviewDialog != null} onOpenChange={open => !open && setReviewDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reviewDialog?.action === "approve" ? "Approve Request" : "Deny Request"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {reviewDialog?.action === "approve"
                ? "Approving will increase the authorization's budget by the requested hours."
                : "Denying will reject the request. The authorization budget will not change."}
            </p>
            <div>
              <Label>Review Note (optional)</Label>
              <Input
                className="mt-1"
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                placeholder="Add a note for the employee..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>Cancel</Button>
            <Button
              onClick={handleReview}
              disabled={reviewMut.isPending}
              className={reviewDialog?.action === "deny" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {reviewMut.isPending ? "Processing…" : reviewDialog?.action === "approve" ? "Approve" : "Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
