import React, { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  Plus,
  Edit,
  Trash2,
  Search,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { insertPdfTemplateSchema, type InsertPdfTemplate, type PdfTemplate } from '@shared/schema';
import { z } from 'zod';

// Template type options
const TEMPLATE_TYPES = [
  { value: 'P1', label: 'P1 Purchase Order' },
  { value: 'P2', label: 'P2 Purchase Order' },
  { value: 'RFQ', label: 'Request for Quote' },
  { value: 'SALES_ORDER', label: 'Sales Order' },
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'COMMERCIAL_INVOICE', label: 'Commercial Invoice' },
];

// Default values for form
const DEFAULT_MARGINS = {
  STANDARD: 40,
  COMPACT: 30,
  WIDE: 50,
};

const DEFAULT_FONT_SIZES = {
  TITLE_LARGE: 18,
  TITLE_MEDIUM: 16,
  TITLE_SMALL: 14,
  SECTION_HEADER: 12,
  BODY_LARGE: 10,
  BODY_MEDIUM: 9,
  BODY_SMALL: 8,
  TINY: 7,
};

const DEFAULT_LINE_HEIGHTS = {
  TITLE: 25,
  SECTION: 20,
  BODY: 15,
  COMPACT: 12,
  DENSE: 10,
};

const DEFAULT_SPACING = {
  SECTION_GAP_LARGE: 40,
  SECTION_GAP_MEDIUM: 30,
  SECTION_GAP_SMALL: 20,
  SECTION_GAP_TINY: 15,
  COLUMN_GAP: 20,
  BOX_PADDING: 8,
  BOX_PADDING_SMALL: 5,
  LINE_SPACING_LARGE: 15,
  LINE_SPACING_MEDIUM: 13,
  LINE_SPACING_SMALL: 11,
  LINE_SPACING_COMPACT: 9,
};

const DEFAULT_COLORS = {
  TEXT_PRIMARY: { r: 0, g: 0, b: 0 },
  TEXT_SECONDARY: { r: 0.3, g: 0.3, b: 0.3 },
  TEXT_TERTIARY: { r: 0.5, g: 0.5, b: 0.5 },
  TEXT_LIGHT: { r: 0.6, g: 0.6, b: 0.6 },
  BG_TABLE_HEADER: { r: 0.9, g: 0.9, b: 0.9 },
  BG_WHITE: { r: 1, g: 1, b: 1 },
  BG_LIGHT_GRAY: { r: 0.95, g: 0.95, b: 0.95 },
  BORDER_BLACK: { r: 0, g: 0, b: 0 },
  BORDER_GRAY: { r: 0.7, g: 0.7, b: 0.7 },
  BORDER_LIGHT: { r: 0.85, g: 0.85, b: 0.85 },
  ACCENT_RED: { r: 0.8, g: 0, b: 0 },
  ACCENT_BLUE: { r: 0, g: 0, b: 0.8 },
  ACCENT_GREEN: { r: 0, g: 0.6, b: 0 },
};

type TemplateFormData = InsertPdfTemplate;

const PDFTemplateManager = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PdfTemplate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collapsible sections state
  const [marginsOpen, setMarginsOpen] = useState(false);
  const [fontSizesOpen, setFontSizesOpen] = useState(false);
  const [lineHeightsOpen, setLineHeightsOpen] = useState(false);
  const [spacingOpen, setSpacingOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);

  // Form setup
  const form = useForm<TemplateFormData>({
    resolver: zodResolver(insertPdfTemplateSchema),
    defaultValues: {
      name: '',
      templateType: 'P1',
      description: '',
      logoPath: '',
      companyName: '',
      companyAddress: '',
      companyPhone: '',
      companyEmail: '',
      companyWebsite: '',
      headerText: '',
      footerText: '',
      margins: DEFAULT_MARGINS,
      fontSizes: DEFAULT_FONT_SIZES,
      lineHeights: DEFAULT_LINE_HEIGHTS,
      spacing: DEFAULT_SPACING,
      colors: DEFAULT_COLORS,
      isActive: true,
    },
  });

  // Fetch templates
  const { data: templates, isLoading } = useQuery<PdfTemplate[]>({
    queryKey: ['/api/pdf-templates'],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      return await apiRequest('/api/pdf-templates', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      toast({
        title: 'Success',
        description: 'Template created successfully',
      });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create template',
        variant: 'destructive',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TemplateFormData> }) => {
      return await apiRequest(`/api/pdf-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      toast({
        title: 'Success',
        description: 'Template updated successfully',
      });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update template',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/pdf-templates/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      toast({
        title: 'Success',
        description: 'Template deleted successfully',
      });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete template',
        variant: 'destructive',
      });
    },
  });

  // Logo upload mutation
  const uploadLogoMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('logo', file);
      
      const response = await fetch(`/api/pdf-templates/${id}/logo`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload logo');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      form.setValue('logoPath', data.logoPath);
      setLogoPreview(`/api/assets/${data.logoPath}`);
      toast({
        title: 'Success',
        description: 'Logo uploaded successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload logo',
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleOpenDialog = (template?: PdfTemplate) => {
    if (template) {
      setEditingTemplate(template);
      form.reset({
        name: template.name,
        templateType: template.templateType,
        description: template.description || '',
        logoPath: template.logoPath || '',
        companyName: template.companyName || '',
        companyAddress: template.companyAddress || '',
        companyPhone: template.companyPhone || '',
        companyEmail: template.companyEmail || '',
        companyWebsite: template.companyWebsite || '',
        headerText: template.headerText || '',
        footerText: template.footerText || '',
        margins: template.margins as any || DEFAULT_MARGINS,
        fontSizes: template.fontSizes as any || DEFAULT_FONT_SIZES,
        lineHeights: template.lineHeights as any || DEFAULT_LINE_HEIGHTS,
        spacing: template.spacing as any || DEFAULT_SPACING,
        colors: template.colors as any || DEFAULT_COLORS,
        isActive: template.isActive,
      });
      if (template.logoPath) {
        setLogoPreview(`/api/assets/${template.logoPath}`);
      }
    } else {
      setEditingTemplate(null);
      form.reset({
        name: '',
        templateType: 'P1',
        description: '',
        logoPath: '',
        companyName: '',
        companyAddress: '',
        companyPhone: '',
        companyEmail: '',
        companyWebsite: '',
        headerText: '',
        footerText: '',
        margins: DEFAULT_MARGINS,
        fontSizes: DEFAULT_FONT_SIZES,
        lineHeights: DEFAULT_LINE_HEIGHTS,
        spacing: DEFAULT_SPACING,
        colors: DEFAULT_COLORS,
        isActive: true,
      });
      setLogoPreview(null);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
    setLogoPreview(null);
    form.reset();
  };

  const handleSubmit = (data: TemplateFormData) => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleToggleActive = (template: PdfTemplate) => {
    updateMutation.mutate({
      id: template.id,
      data: { isActive: !template.isActive },
    });
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      toast({
        title: 'Error',
        description: 'Invalid file type. Only PNG, JPG, JPEG, and SVG files are allowed.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'File size exceeds 5MB limit.',
        variant: 'destructive',
      });
      return;
    }

    // Preview the image
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload if editing existing template
    if (editingTemplate) {
      setIsUploadingLogo(true);
      try {
        await uploadLogoMutation.mutateAsync({ id: editingTemplate.id, file });
      } finally {
        setIsUploadingLogo(false);
      }
    }
  };

  // Filter templates
  const filteredTemplates = templates?.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.templateType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || template.templateType === filterType;
    return matchesSearch && matchesType;
  }) || [];

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <Card>
        <CardHeader className="border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-blue-600" />
              <CardTitle className="text-2xl">PDF Template Manager</CardTitle>
            </div>
            <Button
              onClick={() => handleOpenDialog()}
              data-testid="button-create-template"
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create New Template
            </Button>
          </div>

          {/* Search and Filter */}
          <div className="flex items-center gap-4 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-templates"
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TEMPLATE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchQuery || filterType !== 'all'
                ? 'No templates found matching your criteria'
                : 'No templates yet. Create your first template to get started.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Logo</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {TEMPLATE_TYPES.find((t) => t.value === template.templateType)?.label || template.templateType}
                      </Badge>
                    </TableCell>
                    <TableCell>{template.companyName || '-'}</TableCell>
                    <TableCell>
                      {template.logoPath ? (
                        <div className="w-16 h-10 relative border border-gray-200 rounded overflow-hidden bg-white">
                          <img
                            src={`/api/assets/${template.logoPath}`}
                            alt="Logo"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-10 flex items-center justify-center border border-dashed border-gray-300 rounded bg-gray-50">
                          <ImageIcon className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.isActive ? (
                        <Badge className="bg-green-100 text-green-800 border-green-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-600">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(template)}
                          data-testid={`button-toggle-active-${template.id}`}
                          title={template.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {template.isActive ? (
                            <XCircle className="h-4 w-4 text-orange-600" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(template)}
                          data-testid={`button-edit-template-${template.id}`}
                        >
                          <Edit className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirmId(template.id)}
                          data-testid={`button-delete-template-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Template Editor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Edit Template' : 'Create New Template'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
                Basic Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    {...form.register('name')}
                    data-testid="input-template-name"
                    placeholder="My Template"
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="templateType">Template Type *</Label>
                  <Select
                    value={form.watch('templateType')}
                    onValueChange={(value) => form.setValue('templateType', value)}
                  >
                    <SelectTrigger data-testid="select-template-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...form.register('description')}
                  data-testid="input-description"
                  placeholder="Template description..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isActive"
                    checked={form.watch('isActive')}
                    onCheckedChange={(checked) => form.setValue('isActive', !!checked)}
                    data-testid="checkbox-is-active"
                  />
                  <Label htmlFor="isActive" className="cursor-pointer">
                    Active Template
                  </Label>
                </div>
              </div>
            </div>

            {/* Company Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
                Company Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    {...form.register('companyName')}
                    data-testid="input-company-name"
                    placeholder="Company Name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyPhone">Phone</Label>
                  <Input
                    id="companyPhone"
                    {...form.register('companyPhone')}
                    data-testid="input-company-phone"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyEmail">Email</Label>
                  <Input
                    id="companyEmail"
                    type="email"
                    {...form.register('companyEmail')}
                    data-testid="input-company-email"
                    placeholder="contact@company.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyWebsite">Website</Label>
                  <Input
                    id="companyWebsite"
                    {...form.register('companyWebsite')}
                    data-testid="input-company-website"
                    placeholder="www.company.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyAddress">Address</Label>
                <Textarea
                  id="companyAddress"
                  {...form.register('companyAddress')}
                  data-testid="input-company-address"
                  placeholder="123 Main St, City, ST 12345"
                  rows={2}
                />
              </div>
            </div>

            {/* Header & Footer */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
                Header & Footer
              </h3>

              <div className="space-y-2">
                <Label htmlFor="headerText">Header Text</Label>
                <Textarea
                  id="headerText"
                  {...form.register('headerText')}
                  data-testid="input-header-text"
                  placeholder="Header text..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="footerText">Footer Text</Label>
                <Textarea
                  id="footerText"
                  {...form.register('footerText')}
                  data-testid="input-footer-text"
                  placeholder="Footer text..."
                  rows={2}
                />
              </div>
            </div>

            {/* Logo Upload */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
                Logo
              </h3>

              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  onChange={handleLogoChange}
                  className="hidden"
                  data-testid="input-logo-file"
                />

                {logoPreview ? (
                  <div className="flex items-start gap-4">
                    <div className="w-32 h-32 border-2 border-gray-300 rounded overflow-hidden bg-white flex items-center justify-center">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        data-testid="button-change-logo"
                      >
                        {isUploadingLogo ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Change Logo
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-gray-500">
                        PNG, JPG, JPEG, or SVG • Max 5MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-logo"
                    className="w-full h-32 border-2 border-dashed"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-gray-400" />
                      <span className="text-sm text-gray-600">Click to upload logo</span>
                      <span className="text-xs text-gray-500">PNG, JPG, JPEG, or SVG • Max 5MB</span>
                    </div>
                  </Button>
                )}
              </div>
            </div>

            {/* Styling Sections - Collapsible */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
                Styling Configuration
              </h3>

              {/* Margins */}
              <Collapsible open={marginsOpen} onOpenChange={setMarginsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between"
                    data-testid="button-toggle-margins"
                  >
                    <span className="font-medium">Margins</span>
                    {marginsOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 py-3 space-y-3 bg-gray-50 rounded">
                  {Object.keys(DEFAULT_MARGINS).map((key) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="w-32 text-sm">{key}</Label>
                      <Input
                        type="number"
                        {...form.register(`margins.${key}` as any, { valueAsNumber: true })}
                        data-testid={`input-margin-${key.toLowerCase()}`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Font Sizes */}
              <Collapsible open={fontSizesOpen} onOpenChange={setFontSizesOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between"
                    data-testid="button-toggle-font-sizes"
                  >
                    <span className="font-medium">Font Sizes</span>
                    {fontSizesOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 py-3 space-y-3 bg-gray-50 rounded">
                  {Object.keys(DEFAULT_FONT_SIZES).map((key) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="w-40 text-sm">{key}</Label>
                      <Input
                        type="number"
                        {...form.register(`fontSizes.${key}` as any, { valueAsNumber: true })}
                        data-testid={`input-font-size-${key.toLowerCase()}`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Line Heights */}
              <Collapsible open={lineHeightsOpen} onOpenChange={setLineHeightsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between"
                    data-testid="button-toggle-line-heights"
                  >
                    <span className="font-medium">Line Heights</span>
                    {lineHeightsOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 py-3 space-y-3 bg-gray-50 rounded">
                  {Object.keys(DEFAULT_LINE_HEIGHTS).map((key) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="w-32 text-sm">{key}</Label>
                      <Input
                        type="number"
                        {...form.register(`lineHeights.${key}` as any, { valueAsNumber: true })}
                        data-testid={`input-line-height-${key.toLowerCase()}`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Spacing */}
              <Collapsible open={spacingOpen} onOpenChange={setSpacingOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between"
                    data-testid="button-toggle-spacing"
                  >
                    <span className="font-medium">Spacing</span>
                    {spacingOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 py-3 space-y-3 bg-gray-50 rounded">
                  {Object.keys(DEFAULT_SPACING).map((key) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="w-48 text-sm">{key}</Label>
                      <Input
                        type="number"
                        {...form.register(`spacing.${key}` as any, { valueAsNumber: true })}
                        data-testid={`input-spacing-${key.toLowerCase()}`}
                        className="flex-1"
                      />
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Colors */}
              <Collapsible open={colorsOpen} onOpenChange={setColorsOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between"
                    data-testid="button-toggle-colors"
                  >
                    <span className="font-medium">Colors</span>
                    {colorsOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 py-3 space-y-4 bg-gray-50 rounded">
                  {Object.keys(DEFAULT_COLORS).map((key) => {
                    const colorValue = form.watch(`colors.${key}` as any) || DEFAULT_COLORS[key as keyof typeof DEFAULT_COLORS];
                    return (
                      <div key={key} className="space-y-2">
                        <Label className="text-sm font-medium">{key}</Label>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">R</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              {...form.register(`colors.${key}.r` as any, { valueAsNumber: true })}
                              data-testid={`input-color-${key.toLowerCase()}-r`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">G</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              {...form.register(`colors.${key}.g` as any, { valueAsNumber: true })}
                              data-testid={`input-color-${key.toLowerCase()}-g`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-600">B</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              {...form.register(`colors.${key}.b` as any, { valueAsNumber: true })}
                              data-testid={`input-color-${key.toLowerCase()}-b`}
                            />
                          </div>
                        </div>
                        <div
                          className="h-8 w-full rounded border border-gray-300"
                          style={{
                            backgroundColor: `rgb(${Math.round(colorValue.r * 255)}, ${Math.round(colorValue.g * 255)}, ${Math.round(colorValue.b * 255)})`,
                          }}
                        />
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={isPending}
                data-testid="button-cancel-template"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-save-template"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingTemplate ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  editingTemplate ? 'Update Template' : 'Create Template'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this template. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PDFTemplateManager;
