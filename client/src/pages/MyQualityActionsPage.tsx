/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { Link } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function MyQualityActionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    changeType: 'PROCESS',
    scope: 'PART',
    partNumber: '',
    proposedChange: '',
    reason: '',
    riskAssessment: '',
    contextType: 'WORK_ORDER',
    contextId: '',
  });

  const load = async () => {
    const response = await fetch('/api/change-control/my-pcrs', {
      credentials: 'include',
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok)
      throw new Error(
        payload.message || payload.error || 'Unable to load your PCRs'
      );
    setRows(Array.isArray(payload) ? payload : []);
  };

  useEffect(() => {
    void load().catch((caught) =>
      setError(
        caught instanceof Error ? caught.message : 'Unable to load your PCRs'
      )
    );
  }, []);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/change-control/pcrs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload.message || payload.error || 'PCR submission failed'
        );
      setForm({
        ...form,
        partNumber: '',
        proposedChange: '',
        reason: '',
        riskAssessment: '',
        contextId: '',
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'PCR submission failed'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">My Process Change Requests</h1>
        <p className="text-muted-foreground">
          Submit a proposed production change and follow its status. Submission
          never authorizes implementation or departure from released
          requirements.
        </p>
      </div>
      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Submit a PCR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              label="Change type"
              value={form.changeType}
              onChange={(value) => setForm({ ...form, changeType: value })}
            />
            <Field
              label="Scope"
              value={form.scope}
              onChange={(value) => setForm({ ...form, scope: value })}
            />
            <Field
              label="Part number"
              value={form.partNumber}
              onChange={(value) => setForm({ ...form, partNumber: value })}
            />
            <div className="space-y-2">
              <Label>Linked context</Label>
              <Select
                value={form.contextType}
                onValueChange={(value) =>
                  setForm({ ...form, contextType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    'WORK_ORDER',
                    'TRAVELER',
                    'ROUTING',
                    'INVENTORY_ITEM',
                    'MAINTENANCE',
                    'CONTROLLED_DOCUMENT',
                    'WORK_INSTRUCTION',
                  ].map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Context record ID"
              value={form.contextId}
              onChange={(value) => setForm({ ...form, contextId: value })}
            />
          </div>
          <Label>Proposed production/process change</Label>
          <Textarea
            value={form.proposedChange}
            onChange={(event) =>
              setForm({ ...form, proposedChange: event.target.value })
            }
          />
          <Label>Reason and business justification</Label>
          <Textarea
            value={form.reason}
            onChange={(event) =>
              setForm({ ...form, reason: event.target.value })
            }
          />
          <Label>Known risk, safety, customer, or product impact</Label>
          <Textarea
            value={form.riskAssessment}
            onChange={(event) =>
              setForm({ ...form, riskAssessment: event.target.value })
            }
          />
          <Button
            disabled={
              busy || !form.proposedChange.trim() || !form.reason.trim()
            }
            onClick={() => void submit()}
          >
            Submit for QMS screening
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!rows.length && (
            <p className="text-sm text-muted-foreground">
              No PCRs submitted by your account.
            </p>
          )}
          {rows.map((row) => (
            <div key={row.id} className="rounded border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{row.change_number}</strong>
                <Badge>{row.quality_action_status}</Badge>
              </div>
              <p className="mt-2 text-sm">{row.proposed_change}</p>
              {row.investigation_due_date && (
                <p className="text-sm text-muted-foreground">
                  Investigation due: {row.investigation_due_date}
                </p>
              )}
              {row.next_action_statement && (
                <p className="text-sm text-muted-foreground">
                  Current action: {row.next_action_statement}
                </p>
              )}
              {row.change_control_record_id && (
                <Link
                  href={`/qms/change-control?record=${row.change_control_record_id}`}
                >
                  <Button className="mt-2" size="sm" variant="outline">
                    Open register record
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
