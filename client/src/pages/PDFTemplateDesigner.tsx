import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { Designer } from '@pdfme/ui';
import { Template } from '@pdfme/common';
import { text, image, barcodes } from '@pdfme/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { PdfTemplate } from '@shared/schema';
import { Upload, Download, FileJson } from 'lucide-react';

const defaultTemplate: Template = {
  basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
  schemas: [
    {
      companyName: {
        type: 'text',
        position: { x: 10, y: 10 },
        width: 100,
        height: 10,
        fontSize: 16,
        fontColor: '#000000',
      },
      poNumber: {
        type: 'text',
        position: { x: 120, y: 10 },
        width: 80,
        height: 10,
        fontSize: 14,
        fontColor: '#000000',
      },
    },
  ],
};

const templateTypes = [
  { value: 'vendor_po', label: 'Vendor Purchase Order' },
  { value: 'sales_order', label: 'Sales Order' },
  { value: 'shipping_label', label: 'Shipping Label' },
  { value: 'invoice', label: 'Invoice' },
];

export default function PDFTemplateDesigner() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const designerRef = useRef<HTMLDivElement>(null);
  const designerInstanceRef = useRef<Designer | null>(null);
  
  const [templateName, setTemplateName] = useState('');
  const [templateType, setTemplateType] = useState('vendor_po');
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const { data: existingTemplate, isLoading } = useQuery<PdfTemplate>({
    queryKey: ['/api/pdf-templates', id],
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/pdf-templates', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      toast({
        title: 'Template Created',
        description: 'PDF template has been created successfully.',
      });
      navigate('/pdf-templates');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create template',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/pdf-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      toast({
        title: 'Template Updated',
        description: 'PDF template has been updated successfully.',
      });
      navigate('/pdf-templates');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update template',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (existingTemplate) {
      setTemplateName(existingTemplate.name);
      setTemplateType(existingTemplate.type);
      setIsDefault(existingTemplate.isDefault ?? false);
      setIsActive(existingTemplate.isActive ?? true);
    }
  }, [existingTemplate]);

  useEffect(() => {
    if (designerRef.current && !designerInstanceRef.current) {
      const template = existingTemplate?.templateJson
        ? (existingTemplate.templateJson as any as Template)
        : defaultTemplate;

      designerInstanceRef.current = new Designer({
        domContainer: designerRef.current,
        template,
        plugins: {
          text,
          image,
          qrcode: barcodes.qrcode,
        },
      });
    }

    return () => {
      if (designerInstanceRef.current) {
        designerInstanceRef.current.destroy();
        designerInstanceRef.current = null;
      }
    };
  }, [existingTemplate]);

  const handleSave = async () => {
    if (!designerInstanceRef.current) return;

    if (!templateName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a template name',
        variant: 'destructive',
      });
      return;
    }

    const template = designerInstanceRef.current.getTemplate();
    
    const data = {
      name: templateName,
      type: templateType,
      templateJson: template as any,
      isDefault,
      isActive,
    };

    if (id) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleImportJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedTemplate = JSON.parse(text) as Template;
        
        if (designerInstanceRef.current) {
          designerInstanceRef.current.destroy();
          designerInstanceRef.current = null;
        }

        if (designerRef.current) {
          designerInstanceRef.current = new Designer({
            domContainer: designerRef.current,
            template: importedTemplate,
            plugins: {
              text,
              image,
              qrcode: barcodes.qrcode,
            },
          });
        }

        toast({
          title: 'Template Imported',
          description: 'JSON template has been loaded successfully.',
        });
      } catch (error) {
        toast({
          title: 'Import Error',
          description: 'Failed to parse JSON file. Please check the file format.',
          variant: 'destructive',
        });
      }
    };
    input.click();
  };

  const handleExportJson = () => {
    if (!designerInstanceRef.current) return;

    const template = designerInstanceRef.current.getTemplate();
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateName || 'template'}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Template Exported',
      description: 'JSON template has been downloaded.',
    });
  };

  const handleImportBasePdf = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        );

        const currentTemplate = designerInstanceRef.current?.getTemplate() || defaultTemplate;
        const newTemplate: Template = {
          ...currentTemplate,
          basePdf: `data:application/pdf;base64,${base64}`,
        };

        if (designerInstanceRef.current) {
          designerInstanceRef.current.destroy();
          designerInstanceRef.current = null;
        }

        if (designerRef.current) {
          designerInstanceRef.current = new Designer({
            domContainer: designerRef.current,
            template: newTemplate,
            plugins: {
              text,
              image,
              qrcode: barcodes.qrcode,
            },
          });
        }

        toast({
          title: 'Base PDF Imported',
          description: 'PDF has been loaded as the base template.',
        });
      } catch (error) {
        toast({
          title: 'Import Error',
          description: 'Failed to load PDF file.',
          variant: 'destructive',
        });
      }
    };
    input.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-black text-black dark:text-white">
        <p data-testid="text-loading">Loading template...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-page-title">
            {id ? 'Edit' : 'Create'} PDF Template
          </h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleImportJson}
              data-testid="button-import-json"
              className="bg-white dark:bg-gray-800 text-black dark:text-white"
            >
              <FileJson className="w-4 h-4 mr-2" />
              Import JSON
            </Button>
            <Button
              variant="outline"
              onClick={handleExportJson}
              data-testid="button-export-json"
              className="bg-white dark:bg-gray-800 text-black dark:text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
            <Button
              variant="outline"
              onClick={handleImportBasePdf}
              data-testid="button-import-pdf"
              className="bg-white dark:bg-gray-800 text-black dark:text-white"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Base PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/pdf-templates')}
              data-testid="button-cancel"
              className="bg-white dark:bg-gray-800 text-black dark:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : 'Save Template'}
            </Button>
          </div>
        </div>

        <Card className="bg-white dark:bg-gray-800 text-black dark:text-white">
          <CardHeader>
            <CardTitle>Template Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  data-testid="input-template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Enter template name"
                  className="bg-white dark:bg-gray-700 text-black dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-type">Template Type</Label>
                <Select value={templateType} onValueChange={setTemplateType}>
                  <SelectTrigger
                    id="template-type"
                    data-testid="select-template-type"
                    className="bg-white dark:bg-gray-700 text-black dark:text-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  data-testid="checkbox-is-active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Active</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  data-testid="checkbox-is-default"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Set as Default</span>
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 text-black dark:text-white">
          <CardHeader>
            <CardTitle>Template Designer</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={designerRef}
              style={{ width: '100%', height: '600px' }}
              data-testid="container-designer"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
