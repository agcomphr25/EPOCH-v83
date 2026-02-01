import { useState, useCallback, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Save, Plus, Type, Mail, Calendar, CheckSquare, List, PenLine, Loader2 } from 'lucide-react';
import PdfCanvas from '@/components/pdf-editor/PdfCanvas';
import FieldOverlay, { NormalizedFieldDef } from '@/components/pdf-editor/FieldOverlay';
import FieldInspectorPanel from '@/components/pdf-editor/FieldInspectorPanel';

interface Template {
  id: string;
  name: string;
  description: string | null;
  templatePdfPath: string;
  fieldDefsJson: any[];
}

const fieldTypes = [
  { type: 'text', label: 'Text Field', icon: Type },
  { type: 'email', label: 'Email Field', icon: Mail },
  { type: 'date', label: 'Date Field', icon: Calendar },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { type: 'select', label: 'Dropdown', icon: List },
  { type: 'signature', label: 'Signature', icon: PenLine },
] as const;

function generateId() {
  return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function convertToNormalized(fieldDef: any, pageWidth: number, pageHeight: number): NormalizedFieldDef {
  if (fieldDef.normalizedX !== undefined) {
    return fieldDef as NormalizedFieldDef;
  }
  
  const x = fieldDef.x ?? 100;
  const y = fieldDef.y ?? 100;
  const width = fieldDef.width ?? 150;
  const height = fieldDef.height ?? 30;

  return {
    id: fieldDef.id || generateId(),
    name: fieldDef.name || 'unnamed',
    label: fieldDef.label || fieldDef.name || 'Unnamed Field',
    type: fieldDef.type || 'text',
    required: fieldDef.required || false,
    page: fieldDef.page ?? 0,
    normalizedX: x / (pageWidth || 612),
    normalizedY: y / (pageHeight || 792),
    normalizedWidth: width / (pageWidth || 612),
    normalizedHeight: height / (pageHeight || 792),
    options: fieldDef.options,
  };
}

function convertFromNormalized(field: NormalizedFieldDef, pageWidth: number, pageHeight: number): any {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    page: field.page,
    x: Math.round(field.normalizedX * pageWidth),
    y: Math.round(field.normalizedY * pageHeight),
    width: Math.round(field.normalizedWidth * pageWidth),
    height: Math.round(field.normalizedHeight * pageHeight),
    options: field.options,
    normalizedX: field.normalizedX,
    normalizedY: field.normalizedY,
    normalizedWidth: field.normalizedWidth,
    normalizedHeight: field.normalizedHeight,
  };
}

export default function VisualFieldEditor() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 612, height: 792 });
  const [fields, setFields] = useState<NormalizedFieldDef[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ['/api/fillable-pdf-templates', id],
    enabled: !!id,
  });

  useEffect(() => {
    if (template?.fieldDefsJson) {
      const normalized = template.fieldDefsJson.map((f) =>
        convertToNormalized(f, pageDimensions.width, pageDimensions.height)
      );
      setFields(normalized);
    }
  }, [template, pageDimensions.width, pageDimensions.height]);

  const saveMutation = useMutation({
    mutationFn: async (fieldDefsJson: any[]) => {
      return apiRequest(`/api/fillable-pdf-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fieldDefsJson }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fillable-pdf-templates', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/fillable-pdf-templates'] });
      setHasChanges(false);
      toast({ title: 'Field definitions saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  const handlePageDimensions = useCallback((dims: { width: number; height: number }) => {
    setPageDimensions(dims);
  }, []);

  const handleAddField = (type: typeof fieldTypes[number]['type']) => {
    const newField: NormalizedFieldDef = {
      id: generateId(),
      name: `${type}_${fields.length + 1}`,
      label: `${type.charAt(0).toUpperCase() + type.slice(1)} Field`,
      type,
      required: false,
      page: currentPage - 1,
      normalizedX: 0.1,
      normalizedY: 0.1,
      normalizedWidth: 0.25,
      normalizedHeight: 0.04,
    };

    if (type === 'signature') {
      newField.normalizedHeight = 0.08;
    }

    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
    setHasChanges(true);
  };

  const handleUpdateField = (fieldId: string, updates: Partial<NormalizedFieldDef>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
    );
    setHasChanges(true);
  };

  const handleDeleteField = (fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
    setHasChanges(true);
  };

  const handleSave = () => {
    const exportedFields = fields.map((f) =>
      convertFromNormalized(f, pageDimensions.width, pageDimensions.height)
    );
    saveMutation.mutate(exportedFields);
  };

  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;
  const pdfUrl = template?.templatePdfPath
    ? `/${template.templatePdfPath}`
    : '';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Template not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/fillable-pdf-templates')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{template.name}</h1>
            <p className="text-sm text-muted-foreground">Visual Field Editor</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Add Field
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {fieldTypes.map(({ type, label, icon: Icon }) => (
                <DropdownMenuItem key={type} onClick={() => handleAddField(type)}>
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex gap-4 p-4 h-[calc(100vh-64px)]">
        <div className="flex-1 overflow-auto">
          {pdfUrl && (
            <PdfCanvas
              pdfUrl={pdfUrl}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onPageDimensions={handlePageDimensions}
            >
              {fields.map((field) => (
                <FieldOverlay
                  key={field.id}
                  field={field}
                  pageWidth={pageDimensions.width}
                  pageHeight={pageDimensions.height}
                  currentPage={currentPage}
                  isSelected={selectedFieldId === field.id}
                  onSelect={() => setSelectedFieldId(field.id)}
                  onUpdate={(updates) => handleUpdateField(field.id, updates)}
                  onDelete={() => handleDeleteField(field.id)}
                />
              ))}
            </PdfCanvas>
          )}
        </div>

        <div className="w-80 flex-shrink-0">
          <FieldInspectorPanel
            field={selectedField}
            pageWidth={pageDimensions.width}
            pageHeight={pageDimensions.height}
            onUpdate={(updates) => {
              if (selectedFieldId) {
                handleUpdateField(selectedFieldId, updates);
              }
            }}
            onDelete={() => {
              if (selectedFieldId) {
                handleDeleteField(selectedFieldId);
              }
            }}
          />

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">All Fields ({fields.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 overflow-auto">
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No fields added yet
                </p>
              ) : (
                <ul className="space-y-1">
                  {fields.map((field) => (
                    <li
                      key={field.id}
                      className={`text-sm px-2 py-1 rounded cursor-pointer hover:bg-gray-100 ${
                        selectedFieldId === field.id ? 'bg-blue-100' : ''
                      }`}
                      onClick={() => {
                        setSelectedFieldId(field.id);
                        if (field.page !== currentPage - 1) {
                          setCurrentPage(field.page + 1);
                        }
                      }}
                    >
                      <span className="font-medium">{field.name}</span>
                      <span className="text-muted-foreground ml-2">({field.type})</span>
                      <span className="text-muted-foreground ml-1">p{field.page + 1}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
