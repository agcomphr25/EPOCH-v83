import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Save,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Info,
  MousePointer,
} from 'lucide-react';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';

interface FieldDef {
  id?: number;
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
  storagePath: string;
  pageCount: number;
  pageDimensions: Array<{ width: number; height: number }>;
  pdfUrl: string | null;
  fields: FieldDef[];
}

interface DrawBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export default function PdfFormsEditorPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/pdf-forms/editor/:id');
  const templateId = params?.id;
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [drawBox, setDrawBox] = useState<DrawBox | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('');
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [pendingField, setPendingField] = useState<Omit<FieldDef, 'label'> | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { canvasRef, containerRef, canvasDims, totalPages } = usePdfRenderer(pdfUrl, currentPage);

  const { data: template, isLoading } = useQuery<PdfFormTemplateWithFields>({
    queryKey: ['/api/pdf-forms', templateId],
    enabled: !!templateId,
  });

  useEffect(() => {
    if (template) {
      setFields(template.fields ?? []);
      setPdfUrl(`/api/pdf-forms/${templateId}/pdf`);
    }
  }, [template, templateId]);

  const getRelativePos = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = e.currentTarget.scrollLeft;
    const scrollTop = e.currentTarget.scrollTop;
    return {
      x: (e.clientX - rect.left + scrollLeft) / canvasDims.width,
      y: (e.clientY - rect.top + scrollTop) / canvasDims.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const pos = getRelativePos(e);
    setIsDrawing(true);
    setDrawBox({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawBox) return;
    const pos = getRelativePos(e);
    setDrawBox(prev => prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawBox) return;
    setIsDrawing(false);
    const pos = getRelativePos(e);
    const x = Math.min(drawBox.startX, pos.x);
    const y = Math.min(drawBox.startY, pos.y);
    const w = Math.abs(pos.x - drawBox.startX);
    const h = Math.abs(pos.y - drawBox.startY);
    setDrawBox(null);

    if (w < 0.02 || h < 0.01) return;

    setPendingField({
      pageIndex: currentPage - 1,
      xPercent: x,
      yPercent: y,
      widthPercent: w,
      heightPercent: h,
    });
    setPendingLabel('');
    setShowLabelDialog(true);
  };

  const confirmField = () => {
    if (!pendingLabel.trim() || !pendingField) return;
    setFields(prev => [...prev, { ...pendingField, label: pendingLabel.trim() }]);
    setShowLabelDialog(false);
    setPendingField(null);
    setPendingLabel('');
  };

  const deleteField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const saveTemplate = async () => {
    if (!templateId) return;
    setIsSaving(true);
    try {
      await apiRequest(`/api/pdf-forms/${templateId}`, { method: 'PATCH', body: { fields } });
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-forms'] });
      toast({ title: 'Template saved', description: `${fields.length} field${fields.length !== 1 ? 's' : ''} saved` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save template';
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const currentPageFields = fields.filter(f => f.pageIndex === currentPage - 1);

  const COLORS = [
    'rgba(59,130,246,0.35)',
    'rgba(16,185,129,0.35)',
    'rgba(249,115,22,0.35)',
    'rgba(168,85,247,0.35)',
    'rgba(236,72,153,0.35)',
  ];

  const drawRect = drawBox
    ? {
        x: Math.min(drawBox.startX, drawBox.currentX),
        y: Math.min(drawBox.startY, drawBox.currentY),
        w: Math.abs(drawBox.currentX - drawBox.startX),
        h: Math.abs(drawBox.currentY - drawBox.startY),
      }
    : null;

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/pdf-forms')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {template?.name ?? 'Template Editor'}
          </h1>
          <p className="text-sm text-gray-500">Click and drag on the PDF to draw labeled text fields</p>
        </div>
        <Button onClick={saveTemplate} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-md">
                  <MousePointer className="h-3.5 w-3.5" />
                  Click and drag to draw a field
                </div>
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
                  style={{ cursor: 'crosshair', maxHeight: '75vh' }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => { setIsDrawing(false); setDrawBox(null); }}
                >
                  <canvas ref={canvasRef} className="block" />

                  {currentPageFields.map((field, idx) => {
                    const globalIdx = fields.indexOf(field);
                    return (
                      <div
                        key={idx}
                        className="absolute rounded border-2 border-blue-500 flex items-start p-0.5 group"
                        style={{
                          left: `${field.xPercent * 100}%`,
                          top: `${field.yPercent * 100}%`,
                          width: `${field.widthPercent * 100}%`,
                          height: `${field.heightPercent * 100}%`,
                          backgroundColor: COLORS[idx % COLORS.length],
                          pointerEvents: 'auto',
                        }}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                      >
                        <span
                          className="text-xs font-semibold text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900/70 px-1 rounded leading-tight truncate max-w-full"
                          style={{ fontSize: `${Math.max(8, field.heightPercent * canvasDims.height * 0.35)}px` }}
                        >
                          {field.label}
                        </span>
                        <button
                          className="absolute -top-2 -right-2 h-4 w-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteField(globalIdx)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}

                  {drawRect && canvasDims.width > 0 && (
                    <div
                      className="absolute border-2 border-blue-400 bg-blue-200/30 pointer-events-none"
                      style={{
                        left: `${drawRect.x * 100}%`,
                        top: `${drawRect.y * 100}%`,
                        width: `${drawRect.w * 100}%`,
                        height: `${drawRect.h * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="w-64 flex-shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Fields on This Page</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {currentPageFields.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No fields on this page yet. Draw a box to add one.
                </p>
              ) : (
                <div className="space-y-2">
                  {currentPageFields.map((field, idx) => {
                    const globalIdx = fields.indexOf(field);
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-1 px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-800 text-sm"
                      >
                        <span className="truncate text-xs font-medium">{field.label}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive flex-shrink-0"
                          onClick={() => deleteField(globalIdx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <Info className="h-3.5 w-3.5" />
                All Fields ({fields.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">No fields added yet</p>
              ) : (
                <div className="space-y-1">
                  {fields.map((field, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs px-1 py-0">
                        p{field.pageIndex + 1}
                      </Badge>
                      <span className="text-xs truncate">{field.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Name this field</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="field-label">Field Label</Label>
            <Input
              id="field-label"
              placeholder="e.g. Operator Name, Part Number, Date"
              value={pendingLabel}
              onChange={e => setPendingLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmField(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLabelDialog(false); setPendingField(null); }}>
              Cancel
            </Button>
            <Button onClick={confirmField} disabled={!pendingLabel.trim()}>
              Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
