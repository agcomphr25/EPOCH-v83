import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';

interface FieldDef {
  id: number;
  pageIndex: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  label: string;
}

interface PdfFormTemplateWithFields {
  id: number;
  name: string;
  pageCount: number;
  pdfUrl: string | null;
  fields: FieldDef[];
}

export default function PdfFormsFillPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/pdf-forms/fill/:id');
  const templateId = params?.id;
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [values, setValues] = useState<Record<string | number, string>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const { canvasRef, containerRef, canvasDims, totalPages } = usePdfRenderer(pdfUrl, currentPage);

  const { data: template, isLoading } = useQuery<PdfFormTemplateWithFields>({
    queryKey: ['/api/pdf-forms', templateId],
    enabled: !!templateId,
  });

  useEffect(() => {
    if (template) {
      setPdfUrl(`/api/pdf-forms/${templateId}/pdf`);
    }
  }, [template, templateId]);

  const fields: FieldDef[] = template?.fields ?? [];
  const currentPageFields = fields.filter(f => f.pageIndex === currentPage - 1);

  const handleDownload = async () => {
    if (!templateId) return;
    setIsDownloading(true);
    try {
      // Raw fetch required: response is a binary PDF blob, not JSON
      const storedToken = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
      const response = await fetch(`/api/pdf-forms/${templateId}/download-filled`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
        },
        body: JSON.stringify({ values }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(template?.name ?? 'form').replace(/[^a-zA-Z0-9-_]/g, '_')}_filled.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Downloaded!', description: 'Your filled PDF has been downloaded.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      toast({ title: 'Download failed', description: msg, variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/pdf-forms')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {template?.name ?? 'Fill Form'}
          </h1>
          <p className="text-sm text-gray-500">Fill in the fields below, then download the completed PDF</p>
        </div>
        <Button
          onClick={handleDownload}
          disabled={isDownloading || fields.length === 0}
        >
          {isDownloading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
          ) : (
            <><Download className="h-4 w-4 mr-2" />Download Filled PDF</>
          )}
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">Page {currentPage} / {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div
                  ref={containerRef}
                  className="relative border rounded-lg overflow-auto bg-gray-100 dark:bg-gray-800"
                  style={{ maxHeight: '75vh' }}
                >
                  <canvas ref={canvasRef} className="block" />

                  {canvasDims.width > 0 && currentPageFields.map((field) => {
                    const left = field.xPercent * canvasDims.width;
                    const top = field.yPercent * canvasDims.height;
                    const width = field.widthPercent * canvasDims.width;
                    const height = field.heightPercent * canvasDims.height;
                    const fontSize = Math.max(10, Math.min(14, height * 0.55));
                    const filled = !!values[field.id]?.trim();

                    return (
                      <div
                        key={field.id}
                        className="absolute"
                        style={{ left, top, width, height }}
                      >
                        <div
                          className={`w-full h-full border-2 rounded ${
                            filled
                              ? 'border-green-400 bg-green-50/90 dark:bg-green-900/40'
                              : 'border-blue-400 bg-blue-50/80 dark:bg-blue-900/40'
                          }`}
                        >
                          <input
                            type="text"
                            value={values[field.id] ?? ''}
                            onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                            placeholder={field.label}
                            className="w-full h-full bg-transparent border-none outline-none px-1 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            style={{ fontSize: `${fontSize}px` }}
                            title={field.label}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="w-72 flex-shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Form Fields</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No fields defined. Use the editor to add fields first.
                </p>
              ) : (
                fields.map((field) => {
                  const filled = !!values[field.id]?.trim();
                  return (
                    <div key={field.id} className="space-y-1">
                      <div className="flex items-center gap-1">
                        {filled && <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
                        <Label className="text-xs font-medium">
                          {field.label}
                          <span className="ml-1 text-muted-foreground font-normal text-xs">
                            (p{field.pageIndex + 1})
                          </span>
                        </Label>
                      </div>
                      <Input
                        value={values[field.id] ?? ''}
                        onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={field.label}
                        className="h-8 text-sm"
                      />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {fields.length > 0 && (
            <div className="text-xs text-center text-muted-foreground">
              {Object.values(values).filter(v => v?.trim()).length} of {fields.length} fields filled
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleDownload}
            disabled={isDownloading || fields.length === 0}
          >
            {isDownloading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Download Filled PDF</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
