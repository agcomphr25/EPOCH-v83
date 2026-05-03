import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileSearch, Calendar, ChevronRight, Loader2, Download, Mail, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuditMeta {
  slug: string;
  title: string;
  date: string;
  summary: string;
}

interface AuditDetail extends AuditMeta {
  content: string;
}

export default function SystemAuditsPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recipients, setRecipients] = useState<string[]>(['']);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const { data: audits = [], isLoading: listLoading } = useQuery<AuditMeta[]>({
    queryKey: ['/api/audits'],
  });

  const { data: detail, isLoading: detailLoading } = useQuery<AuditDetail>({
    queryKey: ['/api/audits', selectedSlug],
    enabled: !!selectedSlug,
  });

  const selectedAudit = selectedSlug ? detail : null;

  async function handleDownloadPdf() {
    if (!selectedSlug) return;
    setDownloading(true);
    try {
      const response = await fetch(`/api/audits/${selectedSlug}/pdf`);
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedSlug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not generate the PDF. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  }

  function openEmailDialog() {
    setRecipients(['']);
    setEmailDialogOpen(true);
  }

  function updateRecipient(index: number, value: string) {
    setRecipients((prev) => prev.map((r, i) => (i === index ? value : r)));
  }

  function addRecipient() {
    setRecipients((prev) => [...prev, '']);
  }

  function removeRecipient(index: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSendEmail() {
    if (!selectedSlug) return;

    const validRecipients = recipients.map((r) => r.trim()).filter((r) => r.length > 0);
    if (validRecipients.length === 0) {
      toast({
        title: 'No recipients',
        description: 'Please enter at least one email address.',
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = validRecipients.filter((r) => !emailRegex.test(r));
    if (invalid.length > 0) {
      toast({
        title: 'Invalid email address',
        description: `Please fix: ${invalid.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const response = await fetch(`/api/audits/${selectedSlug}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: validRecipients }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send email');
      }

      setEmailDialogOpen(false);
      toast({
        title: 'Report sent',
        description: `PDF sent to ${validRecipients.length === 1 ? validRecipients[0] : `${validRecipients.length} recipients`}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Failed to send',
        description: err?.message || 'Could not send the report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden">
      <aside className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-gray-900">System Audit Library</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {audits.length} report{audits.length !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : audits.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              No audit reports found.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {audits.map((audit) => {
                const isSelected = audit.slug === selectedSlug;
                return (
                  <li key={audit.slug}>
                    <button
                      className={cn(
                        'w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors',
                        isSelected && 'bg-primary/5 border-l-2 border-primary'
                      )}
                      onClick={() => setSelectedSlug(audit.slug)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            'text-sm font-medium leading-tight',
                            isSelected ? 'text-primary' : 'text-gray-800'
                          )}
                        >
                          {audit.title}
                        </span>
                        {isSelected && (
                          <ChevronRight className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                      {audit.date && (
                        <div className="flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500">{audit.date}</span>
                        </div>
                      )}
                      {audit.summary && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                          {audit.summary}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50">
        {!selectedSlug ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <FileSearch className="h-12 w-12 text-gray-300 mb-4" />
            <h2 className="text-lg font-medium text-gray-500">Select an audit to view</h2>
            <p className="text-sm text-gray-400 mt-1 max-w-sm">
              Choose an audit report from the list on the left to read its full contents.
            </p>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : selectedAudit ? (
          <div className="max-w-4xl mx-auto px-8 py-8">
            <div className="flex items-center justify-between mb-4">
              <div />
              <div className="flex items-center gap-2">
                <button
                  onClick={openEmailDialog}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <Mail className="h-4 w-4" />
                  Email PDF
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    'bg-primary text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed'
                  )}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {downloading ? 'Generating…' : 'Download PDF'}
                </button>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div
                className="prose prose-sm max-w-none
                  prose-headings:text-gray-900 prose-headings:font-semibold
                  prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                  prose-p:text-gray-700 prose-p:leading-relaxed
                  prose-strong:text-gray-900
                  prose-table:text-sm prose-table:w-full
                  prose-th:bg-gray-100 prose-th:font-semibold prose-th:text-gray-700 prose-th:text-left prose-th:px-3 prose-th:py-2
                  prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-gray-100
                  prose-ul:list-disc prose-ul:pl-5
                  prose-ol:list-decimal prose-ol:pl-5
                  prose-li:text-gray-700 prose-li:mb-1
                  prose-hr:border-gray-200
                  prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-xs"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedAudit.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Report not found.
          </div>
        )}
      </main>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email PDF Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-sm text-gray-600">
              Send <strong>{selectedAudit?.title}</strong> as a PDF attachment to:
            </Label>
            <div className="space-y-2">
              {recipients.map((email, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="email"
                    placeholder="recipient@example.com"
                    value={email}
                    onChange={(e) => updateRecipient(index, e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                  />
                  {recipients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRecipient(index)}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRecipient}
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
            >
              <Plus className="h-3 w-3" />
              Add another recipient
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Report
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
