import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, 
  Upload, 
  Brain, 
  Sparkles, 
  FolderOpen, 
  Eye, 
  FileSpreadsheet,
  ClipboardList,
  BookOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
  Route,
  Library,
  Pencil,
  Trash2,
  MoreHorizontal
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import MediaLibraryPicker from '@/components/MediaLibraryPicker';

interface RoutingDocument {
  id: string;
  title: string;
  partNumber: string | null;
  departmentName: string | null;
  documentType: string;
  sourceType: string;
  fileName: string | null;
  fileUrl: string | null;
  aiExtractedContent: any;
  aiExtractedFields: any[];
  aiProcessedAt: string | null;
  isTemplate: boolean;
  createdAt: string;
}

interface DocumentTemplate {
  id: string;
  templateName: string;
  templateType: string;
  description: string | null;
  learnedFromCount: number;
  structure: any;
  sections: any[];
  defaultFields: any[];
  createdAt: string;
}

interface SpecSheet {
  id: string;
  title: string;
  partNumber: string | null;
  specifications: any;
  isTemplate: boolean;
  createdAt: string;
}

interface InventoryItem {
  id: number;
  agPartNumber: string;
  name: string;
  sku?: string | null;
  itemType?: string | null;
  manufacturedCategory?: string | null;
}

const FORM_DOCUMENT_TYPES = [
  { value: 'work_instruction', label: 'Work Instruction' },
  { value: 'assembly_instruction', label: 'Assembly Instruction' },
  { value: 'operator_instruction', label: 'Operator Instruction' },
  { value: 'maintenance_schedule', label: 'Maintenance Schedule' },
  { value: 'maintenance_instruction', label: 'Maintenance Instruction' },
  { value: 'inspection_form', label: 'Inspection Form' },
  { value: 'quality_checklist', label: 'Quality Checklist' },
  { value: 'training_form', label: 'Training Form' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'quality_procedure', label: 'Quality Procedure' },
  { value: 'spec_sheet', label: 'Spec Sheet' },
  { value: 'specification', label: 'Specification' },
  { value: 'traveler_template', label: 'Traveler Template' },
  { value: 'reference', label: 'Reference' },
  { value: 'other', label: 'Other' },
];

const TEMPLATE_TYPES = [
  { value: 'work_instruction', label: 'Work Instruction' },
  { value: 'assembly_instruction', label: 'Assembly Instruction' },
  { value: 'operator_instruction', label: 'Operator Instruction' },
  { value: 'maintenance_schedule', label: 'Maintenance Schedule' },
  { value: 'maintenance_instruction', label: 'Maintenance Instruction' },
  { value: 'inspection_form', label: 'Inspection Form' },
  { value: 'quality_checklist', label: 'Quality Checklist' },
  { value: 'training_form', label: 'Training Form' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'quality_procedure', label: 'Quality Procedure' },
  { value: 'spec_sheet', label: 'Spec Sheet' },
  { value: 'traveler_template', label: 'Traveler Template' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'other', label: 'Other' },
];

const CNC_SPEC_SHEET_TEMPLATE_NAME = 'CNC Spec Sheet';

const CNC_SPEC_SHEET_TEMPLATE = {
  templateName: CNC_SPEC_SHEET_TEMPLATE_NAME,
  templateType: 'spec_sheet',
  description: 'CNC part specification sheet with materials, saw prep, CNC programs, tumbler, in-process checks, QC standards, and ANSI/ASQ Z1.4 sample sizes.',
  structure: {
    titlePattern: 'SPEC Sheet - {{partName}} Part #{{partNumber}}',
    headerFields: ['sku', 'partNumber', 'partName'],
    tableSections: [
      'parts_list',
      'band_saw',
      'cnc_operations',
      'tumbler',
      'in_process_verification',
      'qc_standards',
      'qc_testing_requirements',
    ],
    example: {
      title: 'SPEC Sheet - Wing Box Rib Part #26006',
      sku: '4002P0146',
      partNumber: '26006',
    },
  },
  sections: [
    { name: 'Header', description: 'Spec sheet title, SKU, part number, and part name' },
    { name: 'Parts List', description: 'Qty, part number, and material/tool descriptions' },
    { name: 'Band Saw', description: 'Cutting instructions before CNC operations' },
    { name: 'CNC', description: 'Program name, machine, runtime, and setup side' },
    { name: 'Tumbler', description: 'Tumbler assignment and minimum cycle time' },
    { name: 'In-Process Verification', description: 'Operator checks performed during production' },
    { name: 'QC Standards', description: 'Measurement, requirement, and tolerance table' },
    { name: 'QC Testing Requirements', description: 'Lot-size sampling based on ANSI/ASQ Z1.4' },
  ],
  defaultFields: [
    { fieldName: 'partName', fieldLabel: 'Part Name', fieldType: 'text', sectionName: 'Header', isRequired: true, defaultValue: 'Wing Box Rib' },
    { fieldName: 'partNumber', fieldLabel: 'Part Number', fieldType: 'text', sectionName: 'Header', isRequired: true, defaultValue: '26006' },
    { fieldName: 'sku', fieldLabel: 'SKU #', fieldType: 'text', sectionName: 'Header', isRequired: true, defaultValue: '4002P0146' },
    { fieldName: 'partsList', fieldLabel: 'Parts List', fieldType: 'textarea', sectionName: 'Parts List', isRequired: true, defaultValue: '1 | 26004 | 6061 Aluminum bar, 3/8" x 4" x 6"\n1 | 373 | Sand Paper 180 grit sheets\n1 | 602 | Deburring Scraper Tool' },
    { fieldName: 'bandSawInstructions', fieldLabel: 'Band Saw Instructions', fieldType: 'textarea', sectionName: 'Band Saw', isRequired: false, defaultValue: 'Cut the aluminum into 6" lengths' },
    { fieldName: 'cncOperations', fieldLabel: 'CNC Operations', fieldType: 'textarea', sectionName: 'CNC', isRequired: true, defaultValue: 'WINGBOXRIB1 | 3 axis | 5 minutes\nWINGBOXRIB2 | 3 axis | 5 minutes\nside 1 | WNGBOXENDHL | Okuma | 20 seconds\nside 2 | WNGBOXENDHL | Okuma | 20 seconds' },
    { fieldName: 'tumblerInstructions', fieldLabel: 'Tumbler Instructions', fieldType: 'textarea', sectionName: 'Tumbler', isRequired: false, defaultValue: 'N/A | Tumbler 2 | minimum 2 hours' },
    { fieldName: 'inProcessVerification', fieldLabel: 'In-Process Verification', fieldType: 'textarea', sectionName: 'In-Process Verification', isRequired: true, defaultValue: 'M4 Hole Threads Front | Check hole threading by fully screwing in a fastener\nM4 Hole Threads Back | Check hole threading by fully screwing in a fastener' },
    { fieldName: 'qcStandards', fieldLabel: 'QC Standards', fieldType: 'textarea', sectionName: 'QC Standards', isRequired: true, defaultValue: 'Large hole diameter | 1.256" | +/-.010\nTop width | .25" | +/-.03\nBottom width | .25" | +/-.03\nRib Thickness | 0.09" | +/-.03\nM4 Hole Threads Front | screw fully seats | 0\nM4 Hole Threads Back | screw fully seats | 0' },
    { fieldName: 'qcTestingRequirements', fieldLabel: 'QC Testing Requirements', fieldType: 'textarea', sectionName: 'QC Testing Requirements', isRequired: true, defaultValue: '2-8 | 2\n9-15 | 3\n16-25 | 5\n26-50 | 8\n51-90 | 13\n91-150 | 20' },
  ],
};

function typeLabel(value: string | null | undefined) {
  if (!value) return 'Document';
  return [...FORM_DOCUMENT_TYPES, ...TEMPLATE_TYPES].find((t) => t.value === value)?.label
    ?? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RoutingDocumentManagement() {
  const [activeTab, setActiveTab] = useState('documents');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showParseDialog, setShowParseDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showLearnDialog, setShowLearnDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<RoutingDocument | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  
  const [uploadForm, setUploadForm] = useState({
    title: '',
    partNumber: '',
    departmentName: '',
    documentType: 'work_instruction',
    isTemplate: false,
    file: null as File | null,
  });
  
  const [parseContent, setParseContent] = useState('');
  const [parseFile, setParseFile] = useState<File | null>(null);
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    partNumber: '',
    partName: '',
    departmentName: '',
    documentType: 'work_instruction',
    templateId: '',
  });
  const [learnForm, setLearnForm] = useState({
    templateName: '',
    templateType: 'work_instruction',
    description: '',
  });
  const [showMediaLibraryPicker, setShowMediaLibraryPicker] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showEditTemplateDialog, setShowEditTemplateDialog] = useState(false);
  const [showEditSpecSheetDialog, setShowEditSpecSheetDialog] = useState(false);
  const [showViewSpecSheetDialog, setShowViewSpecSheetDialog] = useState(false);
  const [showViewTemplateDialog, setShowViewTemplateDialog] = useState(false);
  const [showFillSpecSheetDialog, setShowFillSpecSheetDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'document' | 'template' | 'spec_sheet'; id: string; title: string } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [selectedSpecSheet, setSelectedSpecSheet] = useState<SpecSheet | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    partNumber: '',
    departmentName: '',
    documentType: 'work_instruction',
    isTemplate: false,
  });
  const [editTemplateForm, setEditTemplateForm] = useState({
    templateName: '',
    templateType: 'work_instruction',
    description: '',
  });
  const [editSpecSheetForm, setEditSpecSheetForm] = useState({
    title: '',
    partNumber: '',
    isTemplate: false,
  });
  const [fillSpecSheetForm, setFillSpecSheetForm] = useState({
    templateId: '',
    title: '',
    inventoryItemId: '',
    partNumber: '',
    partName: '',
    sku: '',
    fieldValues: {} as Record<string, string>,
  });
  const [showGenerateRoutingDialog, setShowGenerateRoutingDialog] = useState(false);
  const [generateRoutingForm, setGenerateRoutingForm] = useState({
    partNumber: '',
    partName: '',
    inventoryItemId: '',
    routingName: '',
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading: loadingDocs } = useQuery<RoutingDocument[]>({
    queryKey: ['/api/routing-documents'],
    select: (data: any[]) => data.map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      partNumber: doc.part_number ?? doc.partNumber,
      departmentName: doc.department_name ?? doc.departmentName,
      documentType: doc.document_type ?? doc.documentType ?? 'work_instruction',
      sourceType: doc.source_type ?? doc.sourceType,
      fileName: doc.file_name ?? doc.fileName,
      fileUrl: doc.file_url ?? doc.fileUrl,
      aiExtractedContent: doc.ai_extracted_content ?? doc.aiExtractedContent,
      aiExtractedFields: doc.ai_extracted_fields ?? doc.aiExtractedFields ?? [],
      aiProcessedAt: doc.ai_processed_at ?? doc.aiProcessedAt,
      isTemplate: doc.is_template ?? doc.isTemplate ?? false,
      createdAt: doc.created_at ?? doc.createdAt,
    })),
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<DocumentTemplate[]>({
    queryKey: ['/api/routing-documents/templates/list'],
    select: (data: any[]) => data.map((t: any) => ({
      id: t.id,
      templateName: t.template_name ?? t.templateName ?? 'Untitled',
      templateType: t.template_type ?? t.templateType ?? 'work_instruction',
      description: t.description,
      learnedFromCount: t.learned_from_count ?? t.learnedFromCount ?? 0,
      structure: t.structure,
      sections: t.sections ?? [],
      defaultFields: t.default_fields ?? t.defaultFields ?? [],
      createdAt: t.created_at ?? t.createdAt,
    })),
  });

  const { data: specSheets = [], isLoading: loadingSpecs } = useQuery<SpecSheet[]>({
    queryKey: ['/api/routing-documents/spec-sheets'],
    select: (data: any[]) => data.map((s: any) => ({
      id: s.id,
      title: s.title,
      partNumber: s.part_number ?? s.partNumber,
      specifications: s.specifications,
      isTemplate: s.is_template ?? s.isTemplate ?? false,
      createdAt: s.created_at ?? s.createdAt,
    })),
  });

  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory/items'],
  });

  const manufacturedParts = inventoryItems.filter((item) =>
    item.itemType === 'MANUFACTURED' || !!item.manufacturedCategory
  );

  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File | null; title: string; partNumber: string; departmentName: string; documentType: string; isTemplate: boolean; autoAnalyze?: boolean }) => {
      // If no file, create metadata-only document
      if (!data.file) {
        return apiRequest('/api/routing-documents/create', {
          method: 'POST',
          body: {
            title: data.title,
            partNumber: data.partNumber,
            departmentName: data.departmentName,
            documentType: data.documentType,
            isTemplate: data.isTemplate,
          },
        });
      }
      
      // Convert file to base64 for direct upload with text extraction
      const fileBuffer = await data.file.arrayBuffer();
      const base64Content = btoa(
        new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const isPdfUpload = data.file.type === 'application/pdf' || data.file.name.toLowerCase().endsWith('.pdf');
      if (data.isTemplate && isPdfUpload) {
        return apiRequest('/api/routing-documents/upload-template-to-register', {
          method: 'POST',
          body: {
            fileContent: base64Content,
            fileName: data.file.name,
            mimeType: data.file.type,
            title: data.title || data.file.name,
            partNumber: data.partNumber,
            departmentName: data.departmentName,
            documentType: data.documentType,
          },
          timeout: 120000,
        });
      }
      
      // Upload with content extraction and optional auto-analysis
      return apiRequest('/api/routing-documents/upload-with-extraction', {
        method: 'POST',
        body: {
          fileContent: base64Content,
          fileName: data.file.name,
          mimeType: data.file.type,
          title: data.title || data.file.name,
          partNumber: data.partNumber,
          departmentName: data.departmentName,
          documentType: data.documentType,
          isTemplate: data.isTemplate,
          autoAnalyze: data.autoAnalyze !== false,
        },
        timeout: 120000,
      });
    },
    onSuccess: (response: any, variables) => {
      const hasAiAnalysis = response?.aiAnalysis && Object.keys(response.aiAnalysis).length > 0;
      const extractedLength = response?.extractedLength || 0;
      const controlledNumber = response?.controlledDocument?.documentNumber ?? response?.controlledDocument?.document_number;
      
      let message = variables.file ? 'Document uploaded successfully' : 'Document created successfully';
      if (controlledNumber) {
        message = `Reusable template registered as ${controlledNumber}`;
      }
      if (extractedLength > 0) {
        message += `. Extracted ${extractedLength} characters`;
      }
      if (hasAiAnalysis) {
        message += ' and analyzed with AI';
      }
      
      toast({ title: 'Success', description: message });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/templates/list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] });
      if (controlledNumber) {
        setActiveTab('templates');
      }
      setShowUploadDialog(false);
      setUploadForm({ title: '', partNumber: '', departmentName: '', documentType: 'work_instruction', isTemplate: false, file: null });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to upload document', variant: 'destructive' });
    },
  });

  const parseMutation = useMutation({
    mutationFn: async ({ id, textContent }: { id: string; textContent: string }) => {
      return apiRequest(`/api/routing-documents/${id}/ai-parse`, {
        method: 'POST',
        body: { textContent },
        timeout: 120000,
      });
    },
    onSuccess: () => {
      toast({ title: 'AI Analysis Complete', description: 'Form fields, instructions, and requirements have been extracted' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      setShowParseDialog(false);
      setParseContent('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to parse document', variant: 'destructive' });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { partNumber: string; partName: string; departmentName: string; documentType: string; templateId?: string; referenceDocumentIds?: string[] }) => {
      return apiRequest('/api/routing-documents/ai-generate', {
        method: 'POST',
        body: data,
        timeout: 120000,
      });
    },
    onSuccess: () => {
      toast({ title: 'Form Generated', description: 'New form or instruction document has been created from AI analysis' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/spec-sheets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] });
      setShowGenerateDialog(false);
      setGenerateForm({ partNumber: '', partName: '', departmentName: '', documentType: 'work_instruction', templateId: '' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to generate document', variant: 'destructive' });
    },
  });

  const importFromLibraryMutation = useMutation({
    mutationFn: async (data: { fileUrl: string; filename: string }) => {
      return apiRequest('/api/routing-documents/import-from-library', {
        method: 'POST',
        body: {
          fileUrl: data.fileUrl,
          fileName: data.filename,
          title: data.filename.replace(/\.[^/.]+$/, ''),
          documentType: 'reference',
          sourceType: 'media_library',
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Reference Imported', description: 'Reference has been linked from the media library' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      setShowMediaLibraryPicker(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to import document', variant: 'destructive' });
    },
  });

  const learnMutation = useMutation({
    mutationFn: async (data: { templateName: string; templateType: string; description: string; referenceDocumentIds: string[] }) => {
      return apiRequest('/api/routing-documents/templates/learn', {
        method: 'POST',
        body: data,
        timeout: 120000,
      });
    },
    onSuccess: () => {
      toast({ title: 'Template Created', description: 'AI has learned from the selected documents and created a template' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/templates/list'] });
      setShowLearnDialog(false);
      setLearnForm({ templateName: '', templateType: 'work_instruction', description: '' });
      setSelectedDocuments([]);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to create template', variant: 'destructive' });
    },
  });

  const createCncSpecSheetTemplateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/routing-documents/templates', {
        method: 'POST',
        body: {
          ...CNC_SPEC_SHEET_TEMPLATE,
          fields: CNC_SPEC_SHEET_TEMPLATE.defaultFields,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Template Created', description: 'CNC spec sheet template is ready to use' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/templates/list'] });
      setActiveTab('templates');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to create CNC spec sheet template', variant: 'destructive' });
    },
  });

  const createFilledSpecSheetMutation = useMutation({
    mutationFn: async (data: typeof fillSpecSheetForm) => {
      return apiRequest('/api/routing-documents/spec-sheets/from-template', {
        method: 'POST',
        body: {
          templateId: data.templateId,
          inventoryItemId: data.inventoryItemId || null,
          partNumber: data.partNumber,
          partName: data.partName,
          sku: data.sku,
          title: data.title,
          fieldValues: data.fieldValues,
        },
        timeout: 120000,
      });
    },
    onSuccess: (response: any) => {
      const docNumber = response?.documentNumber || response?.controlledDocument?.documentNumber || response?.controlledDocument?.document_number;
      toast({
        title: 'Spec Sheet Saved',
        description: docNumber ? `Saved to Master Document List as ${docNumber}` : 'Saved to Master Document List and central storage',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/spec-sheets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] });
      setShowFillSpecSheetDialog(false);
      setSelectedTemplate(null);
      setActiveTab('specsheets');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to save filled spec sheet', variant: 'destructive' });
    },
  });

  const generateRoutingMutation = useMutation({
    mutationFn: async (data: { documentId: string; partNumber: string; partName: string; inventoryItemId: string; routingName?: string }) => {
      return apiRequest(`/api/routing-documents/${data.documentId}/generate-routing`, {
        method: 'POST',
        body: {
          partNumber: data.partNumber,
          partName: data.partName,
          inventoryItemId: data.inventoryItemId,
          routingName: data.routingName,
        },
        timeout: 120000,
      });
    },
    onSuccess: (result: any) => {
      toast({ 
        title: 'Part Routing Created', 
        description: `Created routing with ${result.summary?.departmentsCreated || 0} departments and ${result.summary?.operationsExtracted || 0} operations` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings'] });
      setShowGenerateRoutingDialog(false);
      setGenerateRoutingForm({ partNumber: '', partName: '', inventoryItemId: '', routingName: '' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to generate part routing', variant: 'destructive' });
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; partNumber: string; departmentName: string; documentType: string; isTemplate: boolean }) => {
      return apiRequest(`/api/routing-documents/${data.id}`, {
        method: 'PUT',
        body: {
          title: data.title,
          partNumber: data.partNumber || null,
          departmentName: data.departmentName || null,
          documentType: data.documentType,
          isTemplate: data.isTemplate,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Document Updated', description: 'Document details have been saved' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      setShowEditDialog(false);
      setSelectedDocument(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update document', variant: 'destructive' });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/routing-documents/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Document Deleted', description: 'Form or document has been removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete document', variant: 'destructive' });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/routing-documents/templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Template Deleted', description: 'Template has been removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/templates/list'] });
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete template', variant: 'destructive' });
    },
  });

  const deleteSpecSheetMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/routing-documents/spec-sheets/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Spec Sheet Deleted', description: 'Spec sheet has been removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/spec-sheets'] });
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete spec sheet', variant: 'destructive' });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async (data: { id: string; templateName: string; templateType: string; description: string }) => {
      return apiRequest(`/api/routing-documents/templates/${data.id}`, {
        method: 'PUT',
        body: {
          templateName: data.templateName,
          templateType: data.templateType,
          description: data.description || null,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Template Updated', description: 'Template details have been saved' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/templates/list'] });
      setShowEditTemplateDialog(false);
      setSelectedTemplate(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update template', variant: 'destructive' });
    },
  });

  const updateSpecSheetMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; partNumber: string; isTemplate: boolean }) => {
      return apiRequest(`/api/routing-documents/spec-sheets/${data.id}`, {
        method: 'PUT',
        body: {
          title: data.title,
          partNumber: data.partNumber || null,
          isTemplate: data.isTemplate,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Spec Sheet Updated', description: 'Spec sheet details have been saved' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/spec-sheets'] });
      setShowEditSpecSheetDialog(false);
      setSelectedSpecSheet(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update spec sheet', variant: 'destructive' });
    },
  });

  const createTemplateFromSpecSheetMutation = useMutation({
    mutationFn: async (sheetId: string) => {
      return apiRequest(`/api/routing-documents/spec-sheets/${sheetId}/create-template`, {
        method: 'POST',
      });
    },
    onSuccess: (response: any) => {
      toast({ title: 'Template Created', description: 'Spec sheet is ready to use as a reusable template' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/spec-sheets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/templates/list'] });
      const template = response?.template;
      if (template) {
        const responseFields = (response?.fields ?? []).map((field: any) => ({
          ...field,
          fieldName: field.fieldName ?? field.field_name,
          fieldLabel: field.fieldLabel ?? field.field_label,
          fieldType: field.fieldType ?? field.field_type,
          isRequired: field.isRequired ?? field.is_required,
          defaultValue: field.defaultValue ?? field.default_value,
          sectionName: field.sectionName ?? field.section_name,
          sortOrder: field.sortOrder ?? field.sort_order,
        }));
        const normalizedTemplate = {
          ...template,
          templateName: template.templateName ?? template.template_name,
          templateType: template.templateType ?? template.template_type,
          defaultFields: template.defaultFields ?? template.default_fields ?? responseFields,
          sections: template.sections ?? [],
          createdAt: template.createdAt ?? template.created_at,
        } as DocumentTemplate;
        handleUseTemplate(normalizedTemplate);
      } else {
        setActiveTab('templates');
      }
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to create template from spec sheet', variant: 'destructive' });
    },
  });

  const openEditDialog = (doc: RoutingDocument) => {
    setSelectedDocument(doc);
    setEditForm({
      title: doc.title,
      partNumber: doc.partNumber || '',
      departmentName: doc.departmentName || '',
      documentType: doc.documentType,
      isTemplate: doc.isTemplate,
    });
    setShowEditDialog(true);
  };

  const confirmDelete = (type: 'document' | 'template' | 'spec_sheet', id: string, title: string) => {
    setDeleteTarget({ type, id, title });
    setShowDeleteConfirm(true);
  };

  const executeDelete = () => {
    if (!deleteTarget) return;
    switch (deleteTarget.type) {
      case 'document': deleteDocMutation.mutate(deleteTarget.id); break;
      case 'template': deleteTemplateMutation.mutate(deleteTarget.id); break;
      case 'spec_sheet': deleteSpecSheetMutation.mutate(deleteTarget.id); break;
    }
  };

  const handleGenerateRouting = () => {
    if (!selectedDocument) return;
    if (!generateRoutingForm.partNumber || !generateRoutingForm.partName || !generateRoutingForm.inventoryItemId) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    generateRoutingMutation.mutate({
      documentId: selectedDocument.id,
      ...generateRoutingForm,
    });
  };

  const handleUpload = () => {
    // Either file or title is required
    if (!uploadForm.file && !uploadForm.title.trim()) {
      toast({ title: 'Error', description: 'Please enter a title or select a file', variant: 'destructive' });
      return;
    }

    const uploadIsPdf = uploadForm.file?.type === 'application/pdf' || uploadForm.file?.name.toLowerCase().endsWith('.pdf');
    if (uploadForm.isTemplate && uploadForm.file && !uploadIsPdf) {
      toast({ title: 'PDF Required', description: 'Reusable controlled templates must be uploaded as PDF files', variant: 'destructive' });
      return;
    }
    
    uploadMutation.mutate({
      file: uploadForm.file,
      title: uploadForm.title || (uploadForm.file?.name || 'Untitled Document'),
      partNumber: uploadForm.partNumber,
      departmentName: uploadForm.departmentName,
      documentType: uploadForm.documentType,
      isTemplate: uploadForm.isTemplate,
    });
  };

  const loadStoredDocumentText = async (docId: string) => {
    setIsExtractingText(true);
    try {
      const response = await apiRequest(`/api/routing-documents/${docId}/extract-stored-text`, {
        method: 'GET',
        timeout: 60000,
      });
      if (response.extractedText && response.extractedText.trim().length > 100 && 
          !response.extractedText.startsWith('Imported from media library:')) {
        setParseContent(response.extractedText);
        toast({ title: 'Document Text Loaded', description: `Loaded ${response.extractedLength} characters from stored document` });
      } else {
        toast({ 
          title: 'File Not Available', 
          description: 'The original file is no longer on the server. Please upload the PDF or paste the text content below.', 
          variant: 'destructive',
          duration: 8000,
        });
      }
    } catch (error: any) {
      console.error('Failed to load stored document text:', error);
      toast({ 
        title: 'Could Not Load Document', 
        description: 'Please upload the PDF file or paste the text content manually.', 
        variant: 'destructive' 
      });
    } finally {
      setIsExtractingText(false);
    }
  };

  const handleParseFileSelect = async (file: File) => {
    setParseFile(file);
    setIsExtractingText(true);
    
    try {
      // Convert file to base64 and send to server for text extraction
      const fileBuffer = await file.arrayBuffer();
      const base64Content = btoa(
        new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      // Call a simple extraction endpoint
      const response = await apiRequest('/api/routing-documents/extract-text', {
        method: 'POST',
        body: {
          fileContent: base64Content,
          fileName: file.name,
          mimeType: file.type,
        },
      });
      
      if (response.extractedText) {
        setParseContent(response.extractedText);
        toast({ title: 'Text Extracted', description: `Extracted ${response.extractedLength} characters from ${file.name}` });
      } else {
        toast({ title: 'No Text Found', description: 'Could not extract text from this file', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Extraction Failed', description: error.message || 'Failed to extract text from file', variant: 'destructive' });
    } finally {
      setIsExtractingText(false);
    }
  };

  const handleParse = () => {
    if (!selectedDocument || !parseContent.trim()) {
      toast({ title: 'Error', description: 'Please enter document content to analyze', variant: 'destructive' });
      return;
    }
    parseMutation.mutate({ id: selectedDocument.id, textContent: parseContent });
  };

  const handleGenerate = () => {
    if (!generateForm.partNumber) {
      toast({ title: 'Error', description: 'Please enter a reference, part, or equipment ID', variant: 'destructive' });
      return;
    }
    generateMutation.mutate({
      partNumber: generateForm.partNumber,
      partName: generateForm.partName,
      departmentName: generateForm.departmentName,
      documentType: generateForm.documentType,
      templateId: generateForm.templateId || undefined,
      referenceDocumentIds: selectedDocuments.length > 0 ? selectedDocuments : undefined,
    });
  };

  const handleLearn = () => {
    if (!learnForm.templateName || selectedDocuments.length === 0) {
      toast({ title: 'Error', description: 'Please enter a template name and select at least one document', variant: 'destructive' });
      return;
    }
    learnMutation.mutate({
      ...learnForm,
      referenceDocumentIds: selectedDocuments,
    });
  };

  const toggleDocumentSelection = (id: string) => {
    setSelectedDocuments(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const getDocTypeIcon = (type: string) => {
    switch (type) {
      case 'work_instruction': return <ClipboardList className="h-4 w-4" />;
      case 'assembly_instruction': return <ClipboardList className="h-4 w-4" />;
      case 'operator_instruction': return <ClipboardList className="h-4 w-4" />;
      case 'maintenance_schedule': return <ClipboardList className="h-4 w-4" />;
      case 'maintenance_instruction': return <ClipboardList className="h-4 w-4" />;
      case 'inspection_form': return <CheckCircle className="h-4 w-4" />;
      case 'quality_checklist': return <CheckCircle className="h-4 w-4" />;
      case 'training_form': return <BookOpen className="h-4 w-4" />;
      case 'spec_sheet': return <FileSpreadsheet className="h-4 w-4" />;
      case 'traveler_template': return <BookOpen className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const handleCreateCncSpecSheetTemplate = () => {
    const existingTemplate = templates.find((template) =>
      template.templateName.trim().toLowerCase() === CNC_SPEC_SHEET_TEMPLATE_NAME.toLowerCase()
    );

    if (existingTemplate) {
      setSelectedTemplate(existingTemplate);
      setShowViewTemplateDialog(true);
      return;
    }

    createCncSpecSheetTemplateMutation.mutate();
  };

  const openFillSpecSheetDialog = (template: DocumentTemplate) => {
    const fieldValues = (template.defaultFields || []).reduce((acc: Record<string, string>, field: any) => {
      acc[field.fieldName] = field.defaultValue || '';
      return acc;
    }, {});

    setSelectedTemplate(template);
    setFillSpecSheetForm({
      templateId: template.id,
      title: '',
      inventoryItemId: '',
      partNumber: fieldValues.partNumber || '',
      partName: fieldValues.partName || '',
      sku: fieldValues.sku || '',
      fieldValues,
    });
    setShowFillSpecSheetDialog(true);
  };

  const handleUseTemplate = (template: DocumentTemplate) => {
    if (template.templateType === 'spec_sheet') {
      openFillSpecSheetDialog(template);
      return;
    }

    setGenerateForm({
      partNumber: '',
      partName: '',
      documentType: template.templateType || 'work_instruction',
      templateId: template.id,
    });
    setShowGenerateDialog(true);
  };

  const handleManufacturedPartChange = (value: string) => {
    const selectedPart = manufacturedParts.find((item) => String(item.id) === value);
    setFillSpecSheetForm((prev) => {
      const partNumber = selectedPart?.agPartNumber || prev.partNumber;
      const partName = selectedPart?.name || prev.partName;
      const sku = selectedPart?.sku || prev.sku;

      return {
        ...prev,
        inventoryItemId: value,
        partNumber,
        partName,
        sku,
        title: prev.title || `SPEC Sheet - ${partName || 'Part'}${partNumber ? ` Part #${partNumber}` : ''}`,
        fieldValues: {
          ...prev.fieldValues,
          partNumber,
          partName,
          sku,
        },
      };
    });
  };

  const updateFillSpecSheetField = (fieldName: string, value: string) => {
    setFillSpecSheetForm((prev) => ({
      ...prev,
      partNumber: fieldName === 'partNumber' ? value : prev.partNumber,
      partName: fieldName === 'partName' ? value : prev.partName,
      sku: fieldName === 'sku' ? value : prev.sku,
      fieldValues: {
        ...prev.fieldValues,
        [fieldName]: value,
      },
    }));
  };

  const handleSaveFilledSpecSheet = () => {
    if (!fillSpecSheetForm.templateId) {
      toast({ title: 'Error', description: 'Please select a template', variant: 'destructive' });
      return;
    }
    if (!fillSpecSheetForm.partNumber && !fillSpecSheetForm.inventoryItemId) {
      toast({ title: 'Error', description: 'Please link a manufactured part or enter a part number', variant: 'destructive' });
      return;
    }

    createFilledSpecSheetMutation.mutate(fillSpecSheetForm);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Form & Document Builder</h1>
          <p className="text-muted-foreground">
            Create work instructions, assembly instructions, operator instructions, maintenance schedules, and reusable controlled form templates
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowMediaLibraryPicker(true)}>
            <Library className="h-4 w-4 mr-2" />
            Import from Library
          </Button>
          <Button variant="outline" onClick={() => setShowLearnDialog(true)} disabled={selectedDocuments.length === 0}>
            <Brain className="h-4 w-4 mr-2" />
            Learn Template ({selectedDocuments.length})
          </Button>
          <Button variant="outline" onClick={() => setShowGenerateDialog(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Form
          </Button>
          <Button onClick={() => setShowUploadDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Add Document
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{documents.length}</div>
                <div className="text-sm text-muted-foreground">Documents</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{templates.length}</div>
                <div className="text-sm text-muted-foreground">Templates</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{specSheets.length}</div>
                <div className="text-sm text-muted-foreground">Spec Sheets</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Brain className="h-8 w-8 text-amber-500" />
              <div>
                <div className="text-2xl font-bold">{documents.filter(d => d.aiProcessedAt).length}</div>
                <div className="text-sm text-muted-foreground">AI Analyzed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="specsheets">Spec Sheets</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Forms & Documents</CardTitle>
              <CardDescription>Work instructions, assembly instructions, operator instructions, maintenance schedules, procedures, and reusable form templates</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDocs ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>AI Analyzed</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedDocuments.includes(doc.id)}
                            onCheckedChange={() => toggleDocumentSelection(doc.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDocTypeIcon(doc.documentType)}
                            <span className="font-medium">{doc.title}</span>
                            {doc.isTemplate && <Badge variant="secondary">Template</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{typeLabel(doc.documentType)}</Badge>
                        </TableCell>
                        <TableCell>{doc.partNumber || '-'}</TableCell>
                        <TableCell>{doc.departmentName || '-'}</TableCell>
                        <TableCell>
                          {doc.aiProcessedAt ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Analyzed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedDocument(doc);
                                setShowViewDialog(true);
                              }}
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(doc)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setSelectedDocument(doc);
                                  setShowParseDialog(true);
                                  if (doc.fileUrl) {
                                    loadStoredDocumentText(doc.id);
                                  }
                                }}>
                                  <Brain className="h-4 w-4 mr-2" />
                                  Analyze with AI
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setSelectedDocument(doc);
                                  setShowGenerateRoutingDialog(true);
                                }}>
                                  <Route className="h-4 w-4 mr-2" />
                                  Generate Routing
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => confirmDelete('document', doc.id, doc.title)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {documents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No documents uploaded yet. Upload your first document to get started.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Document Templates</CardTitle>
                  <CardDescription>AI-learned templates from your existing documents</CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleCreateCncSpecSheetTemplate}
                  disabled={createCncSpecSheetTemplateMutation.isPending}
                >
                  {createCncSpecSheetTemplateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                  )}
                  Create CNC Spec Sheet
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <Card key={template.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{template.templateName}</CardTitle>
                            <CardDescription>{template.description}</CardDescription>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setSelectedTemplate(template);
                                setShowViewTemplateDialog(true);
                              }}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setSelectedTemplate(template);
                                setEditTemplateForm({
                                  templateName: template.templateName,
                                  templateType: template.templateType,
                                  description: template.description || '',
                                });
                                setShowEditTemplateDialog(true);
                              }}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Template
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => confirmDelete('template', template.id, template.templateName)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{typeLabel(template.templateType)}</Badge>
                            <Badge variant="secondary">Learned from {template.learnedFromCount} docs</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {template.defaultFields?.length || 0} fields defined
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              size="sm"
                              onClick={() => handleUseTemplate(template)}
                            >
                              <Sparkles className="h-4 w-4 mr-2" />
                              Use Template
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {templates.length === 0 && (
                    <div className="col-span-3 text-center py-8 text-muted-foreground">
                      No templates yet. Select documents and click "Learn Template" to create one.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specsheets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Spec Sheets</CardTitle>
              <CardDescription>Generalized specification documents</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSpecs ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {specSheets.map((sheet) => (
                      <TableRow key={sheet.id}>
                        <TableCell className="font-medium">{sheet.title}</TableCell>
                        <TableCell>{sheet.partNumber || '-'}</TableCell>
                        <TableCell>
                          {sheet.isTemplate ? <Badge>Template</Badge> : '-'}
                        </TableCell>
                        <TableCell>{new Date(sheet.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" title="View" onClick={() => {
                              setSelectedSpecSheet(sheet);
                              setShowViewSpecSheetDialog(true);
                            }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedSpecSheet(sheet);
                                  setEditSpecSheetForm({
                                    title: sheet.title,
                                    partNumber: sheet.partNumber || '',
                                    isTemplate: sheet.isTemplate,
                                  });
                                  setShowEditSpecSheetDialog(true);
                                }}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => createTemplateFromSpecSheetMutation.mutate(sheet.id)}
                                  disabled={createTemplateFromSpecSheetMutation.isPending}
                                >
                                  {createTemplateFromSpecSheetMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4 mr-2" />
                                  )}
                                  {sheet.isTemplate ? 'Use as Template' : 'Create Template'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => confirmDelete('spec_sheet', sheet.id, sheet.title)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {specSheets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No spec sheets uploaded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Form or Document</DialogTitle>
            <DialogDescription>Upload a PDF to create a reusable fillable template and register it in the Master Document Register, or add a standard reference document</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>File</Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                placeholder="Document title"
              />
            </div>
            <div>
              <Label>Document Type</Label>
              <Select
                value={uploadForm.documentType}
                onValueChange={(value) => setUploadForm({ ...uploadForm, documentType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Part Number (Optional)</Label>
                <Input
                  value={uploadForm.partNumber}
                  onChange={(e) => setUploadForm({ ...uploadForm, partNumber: e.target.value })}
                  placeholder="e.g., AG-001"
                />
              </div>
              <div>
                <Label>Department (Optional)</Label>
                <Input
                  value={uploadForm.departmentName}
                  onChange={(e) => setUploadForm({ ...uploadForm, departmentName: e.target.value })}
                  placeholder="e.g., Layup"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isTemplate"
                checked={uploadForm.isTemplate}
                onCheckedChange={(checked) => setUploadForm({ ...uploadForm, isTemplate: !!checked })}
              />
              <Label htmlFor="isTemplate">Create reusable template and register in Master Document List</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showParseDialog} onOpenChange={(open) => {
        setShowParseDialog(open);
        if (!open) {
          setParseContent('');
          setParseFile(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>AI Form Analysis</DialogTitle>
            <DialogDescription>
              Upload a PDF or paste content for AI to extract sections, data fields, instructions, checks, schedules, and requirements
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {selectedDocument && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">{selectedDocument.title}</div>
                <div className="text-sm text-muted-foreground">{typeLabel(selectedDocument.documentType)}</div>
              </div>
            )}
            <div className="p-4 border-2 border-dashed rounded-lg text-center">
              <input
                type="file"
                accept=".pdf,.txt,.md,.csv"
                className="hidden"
                id="parse-file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleParseFileSelect(file);
                }}
              />
              <label htmlFor="parse-file-input" className="cursor-pointer">
                {isExtractingText ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Loading document text...</span>
                  </div>
                ) : parseContent && !parseFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <span className="text-sm font-medium">Document text loaded from storage</span>
                    <span className="text-xs text-muted-foreground">Click to upload a different file instead</span>
                  </div>
                ) : parseFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-green-600" />
                    <span className="text-sm font-medium">{parseFile.name}</span>
                    <span className="text-xs text-muted-foreground">Text extracted - click to select different file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Click to upload PDF or text file</span>
                    <span className="text-xs text-muted-foreground">Text will be automatically extracted</span>
                  </div>
                )}
              </label>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or paste content</span>
              </div>
            </div>
            <div>
              <Label>Document Content</Label>
              <Textarea
                value={parseContent}
                onChange={(e) => setParseContent(e.target.value)}
                placeholder="Paste the text content from your document here..."
                className="min-h-[200px]"
              />
              {parseContent && (
                <p className="text-xs text-muted-foreground mt-1">{parseContent.length} characters</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowParseDialog(false)}>Cancel</Button>
            <Button onClick={handleParse} disabled={parseMutation.isPending || !parseContent.trim()}>
              {parseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              Analyze with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFillSpecSheetDialog} onOpenChange={setShowFillSpecSheetDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fill CNC Spec Sheet</DialogTitle>
            <DialogDescription>
              Fill the spec sheet fields, link the manufactured part, and save the finished PDF to the Master Document List
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Manufactured Part</Label>
                <Select value={fillSpecSheetForm.inventoryItemId} onValueChange={handleManufacturedPartChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Link manufactured part" />
                  </SelectTrigger>
                  <SelectContent>
                    {manufacturedParts.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.agPartNumber} - {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sheet Title</Label>
                <Input
                  value={fillSpecSheetForm.title}
                  onChange={(e) => setFillSpecSheetForm({ ...fillSpecSheetForm, title: e.target.value })}
                  placeholder="SPEC Sheet - Wing Box Rib Part #26006"
                />
              </div>
              <div>
                <Label>Part Number</Label>
                <Input
                  value={fillSpecSheetForm.partNumber}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFillSpecSheetForm((prev) => ({
                      ...prev,
                      partNumber: value,
                      fieldValues: { ...prev.fieldValues, partNumber: value },
                    }));
                  }}
                />
              </div>
              <div>
                <Label>SKU #</Label>
                <Input
                  value={fillSpecSheetForm.sku}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFillSpecSheetForm((prev) => ({
                      ...prev,
                      sku: value,
                      fieldValues: { ...prev.fieldValues, sku: value },
                    }));
                  }}
                />
              </div>
            </div>

            {(selectedTemplate?.sections || []).map((section: any) => {
              const sectionFields = (selectedTemplate?.defaultFields || []).filter((field: any) =>
                (field.sectionName || 'Section') === section.name
              );
              if (sectionFields.length === 0) return null;

              return (
                <div key={section.name} className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">{section.name}</h3>
                    {section.description && <p className="text-xs text-muted-foreground">{section.description}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {sectionFields.map((field: any) => {
                      const value = fillSpecSheetForm.fieldValues[field.fieldName] || '';
                      const isLongField = field.fieldType === 'textarea' || value.includes('\n');
                      return (
                        <div key={field.fieldName} className={isLongField ? 'col-span-2' : ''}>
                          <Label>{field.fieldLabel || field.fieldName}</Label>
                          {isLongField ? (
                            <Textarea
                              value={value}
                              onChange={(e) => updateFillSpecSheetField(field.fieldName, e.target.value)}
                              className="min-h-[92px]"
                            />
                          ) : (
                            <Input
                              value={value}
                              onChange={(e) => updateFillSpecSheetField(field.fieldName, e.target.value)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFillSpecSheetDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveFilledSpecSheet} disabled={createFilledSpecSheetMutation.isPending}>
              {createFilledSpecSheetMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Save Spec Sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Form or Document</DialogTitle>
            <DialogDescription>
              Generate a new form or instruction document using a template and selected reference documents
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reference / Part / Equipment ID *</Label>
              <Input
                value={generateForm.partNumber}
                onChange={(e) => setGenerateForm({ ...generateForm, partNumber: e.target.value })}
                placeholder="e.g., AG-001, CNC-03, Paint Booth PM"
              />
            </div>
            <div>
              <Label>Subject / Part Name</Label>
              <Input
                value={generateForm.partName}
                onChange={(e) => setGenerateForm({ ...generateForm, partName: e.target.value })}
                placeholder="e.g., Carbon Fiber Stock, Weekly CNC Maintenance"
              />
            </div>
            <div>
              <Label>Department</Label>
              <Input
                value={generateForm.departmentName}
                onChange={(e) => setGenerateForm({ ...generateForm, departmentName: e.target.value })}
                placeholder="e.g., Layup, CNC, Finish, Quality Control"
              />
            </div>
            <div>
              <Label>Form / Document Type</Label>
              <Select
                value={generateForm.documentType}
                onValueChange={(value) => setGenerateForm({ ...generateForm, documentType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_DOCUMENT_TYPES.filter((type) => type.value !== 'reference').map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Use Template (Optional)</Label>
              <Select
                value={generateForm.templateId}
                onValueChange={(value) => setGenerateForm({ ...generateForm, templateId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.templateName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDocuments.length > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm font-medium">Reference Documents Selected: {selectedDocuments.length}</div>
                <div className="text-xs text-muted-foreground">AI will learn from these documents to generate the new one</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLearnDialog} onOpenChange={setShowLearnDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Learn Template from Forms</DialogTitle>
            <DialogDescription>
              AI will analyze the selected documents and create a reusable form template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium">Selected Documents: {selectedDocuments.length}</div>
              <ScrollArea className="h-24 mt-2">
                {documents.filter(d => selectedDocuments.includes(d.id)).map(doc => (
                  <div key={doc.id} className="text-xs text-muted-foreground">{doc.title}</div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <Label>Template Name *</Label>
              <Input
                value={learnForm.templateName}
                onChange={(e) => setLearnForm({ ...learnForm, templateName: e.target.value })}
                placeholder="e.g., Standard Work Instruction"
              />
            </div>
            <div>
              <Label>Template Type</Label>
              <Select
                value={learnForm.templateType}
                onValueChange={(value) => setLearnForm({ ...learnForm, templateType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={learnForm.description}
                onChange={(e) => setLearnForm({ ...learnForm, description: e.target.value })}
                placeholder="What is this template for?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLearnDialog(false)}>Cancel</Button>
            <Button onClick={handleLearn} disabled={learnMutation.isPending}>
              {learnMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              Learn & Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Document Details
            </DialogTitle>
            <DialogDescription>
              View document information and AI-extracted content
            </DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Title</Label>
                  <div className="font-medium">{selectedDocument.title}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Document Type</Label>
                  <Badge variant="outline">{typeLabel(selectedDocument.documentType)}</Badge>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Part Number</Label>
                  <div>{selectedDocument.partNumber || '-'}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Department</Label>
                  <div>{selectedDocument.departmentName || '-'}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Source</Label>
                  <Badge variant="secondary">{selectedDocument.sourceType}</Badge>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">AI Status</Label>
                  {selectedDocument.aiProcessedAt ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Analyzed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not Analyzed</Badge>
                  )}
                </div>
              </div>

              {selectedDocument.aiExtractedContent && Object.keys(selectedDocument.aiExtractedContent).length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">AI Extracted Content</h3>
                  
                  {selectedDocument.aiExtractedContent.routingSteps?.length > 0 && (
                    <div className="space-y-2">
                      <Label className="font-medium">Routing Steps</Label>
                      <div className="space-y-2">
                        {selectedDocument.aiExtractedContent.routingSteps.map((step: any, idx: number) => (
                          <div key={idx} className="p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-2">
                              <Badge>{step.stepNumber || idx + 1}</Badge>
                              <span className="font-medium">{step.department}</span>
                            </div>
                            <div className="text-sm mt-1">{step.operation}</div>
                            {step.description && <div className="text-sm text-muted-foreground mt-1">{step.description}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedDocument.aiExtractedContent.dataFields?.length > 0 && (
                    <div className="space-y-2">
                      <Label className="font-medium">Data Fields</Label>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Field Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Required</TableHead>
                            <TableHead>Department</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedDocument.aiExtractedContent.dataFields.map((field: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{field.fieldLabel || field.fieldName}</TableCell>
                              <TableCell><Badge variant="outline">{field.fieldType}</Badge></TableCell>
                              <TableCell>{field.isRequired ? 'Yes' : 'No'}</TableCell>
                              <TableCell>{field.department || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {selectedDocument.aiExtractedContent.qualityCheckpoints?.length > 0 && (
                    <div className="space-y-2">
                      <Label className="font-medium">Quality Checkpoints</Label>
                      <div className="space-y-2">
                        {selectedDocument.aiExtractedContent.qualityCheckpoints.map((cp: any, idx: number) => (
                          <div key={idx} className="p-3 bg-muted rounded-lg flex justify-between">
                            <div>
                              <div className="font-medium">{cp.checkpoint}</div>
                              <div className="text-sm text-muted-foreground">Standard: {cp.standard} | Tolerance: {cp.tolerance}</div>
                              {cp.inspectionMethod && <div className="text-xs text-blue-600 mt-0.5">Method: {cp.inspectionMethod}</div>}
                            </div>
                            <Badge variant="secondary">{cp.department}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedDocument.aiExtractedContent.certificationRequirements?.length > 0 && (
                    <div className="space-y-2">
                      <Label className="font-medium">Certification Requirements</Label>
                      <div className="space-y-2">
                        {selectedDocument.aiExtractedContent.certificationRequirements.map((cert: any, idx: number) => (
                          <div key={idx} className="p-3 bg-muted rounded-lg">
                            <div className="font-medium">{cert.certification}</div>
                            <div className="text-sm text-muted-foreground">
                              {cert.department} - {cert.task}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedDocument.aiExtractedContent.materialRequirements?.length > 0 && (
                    <div className="space-y-2">
                      <Label className="font-medium">Material Requirements</Label>
                      <div className="space-y-2">
                        {selectedDocument.aiExtractedContent.materialRequirements.map((mat: any, idx: number) => (
                          <div key={idx} className="p-3 bg-muted rounded-lg flex justify-between items-start">
                            <div>
                              <div className="font-medium">{mat.material}</div>
                              <div className="text-sm text-muted-foreground">{mat.specification}</div>
                              {mat.traceabilityRequired && <div className="text-xs text-amber-600 mt-0.5">Lot traceability required</div>}
                            </div>
                            <Badge variant="secondary">{mat.department}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedDocument.aiExtractedContent.curingParameters?.length > 0 && (
                    <div className="space-y-2">
                      <Label className="font-medium">Curing Parameters</Label>
                      <div className="space-y-2">
                        {selectedDocument.aiExtractedContent.curingParameters.map((cure: any, idx: number) => (
                          <div key={idx} className="p-3 bg-muted rounded-lg flex justify-between items-start">
                            <div>
                              <div className="font-medium">{cure.step}</div>
                              <div className="text-sm text-muted-foreground">
                                Temp: {cure.temperature} | Time: {cure.time}
                                {cure.vacuumPressure && ` | Vacuum: ${cure.vacuumPressure}`}
                                {cure.rampRate && ` | Ramp: ${cure.rampRate}`}
                              </div>
                            </div>
                            <Badge variant="secondary">{cure.department}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(!selectedDocument.aiExtractedContent || Object.keys(selectedDocument.aiExtractedContent).length === 0) && (
                <div className="p-6 text-center bg-muted/50 rounded-lg">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h4 className="font-medium">No AI Analysis Available</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click the "Analyze with AI" button in the actions column to extract routing information from this document.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>Close</Button>
            {selectedDocument && !selectedDocument.aiProcessedAt && (
              <Button onClick={() => {
                setShowViewDialog(false);
                setShowParseDialog(true);
                if (selectedDocument.fileUrl) {
                  loadStoredDocumentText(selectedDocument.id);
                }
              }}>
                <Brain className="h-4 w-4 mr-2" />
                Analyze with AI
              </Button>
            )}
            {selectedDocument && selectedDocument.aiExtractedContent?.routingSteps?.length > 0 && (
              <Button onClick={() => {
                setShowViewDialog(false);
                setShowGenerateRoutingDialog(true);
              }}>
                <Route className="h-4 w-4 mr-2" />
                Generate Part Routing
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Part Routing Dialog */}
      <Dialog open={showGenerateRoutingDialog} onOpenChange={setShowGenerateRoutingDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Part Routing</DialogTitle>
            <DialogDescription>
              Create a part routing from the AI-extracted steps in "{selectedDocument?.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedDocument?.aiExtractedContent?.routingSteps && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="font-medium mb-1">Extracted Routing Steps:</div>
                <div className="text-muted-foreground">
                  {selectedDocument.aiExtractedContent.routingSteps.length} steps across{' '}
                  {new Set(selectedDocument.aiExtractedContent.routingSteps.map((s: any) => s.department)).size} departments
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="routing-part-number">Part Number *</Label>
              <Input
                id="routing-part-number"
                value={generateRoutingForm.partNumber}
                onChange={(e) => setGenerateRoutingForm(prev => ({ ...prev, partNumber: e.target.value }))}
                placeholder="e.g., PL2-TUBE-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routing-part-name">Part Name *</Label>
              <Input
                id="routing-part-name"
                value={generateRoutingForm.partName}
                onChange={(e) => setGenerateRoutingForm(prev => ({ ...prev, partName: e.target.value }))}
                placeholder="e.g., 12-inch Disruptor Tube"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routing-inventory-id">Inventory Item ID *</Label>
              <Input
                id="routing-inventory-id"
                value={generateRoutingForm.inventoryItemId}
                onChange={(e) => setGenerateRoutingForm(prev => ({ ...prev, inventoryItemId: e.target.value }))}
                placeholder="e.g., INV-001 or existing inventory ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routing-name">Routing Name (optional)</Label>
              <Input
                id="routing-name"
                value={generateRoutingForm.routingName}
                onChange={(e) => setGenerateRoutingForm(prev => ({ ...prev, routingName: e.target.value }))}
                placeholder="Leave blank to use document title"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateRoutingDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleGenerateRouting}
              disabled={generateRoutingMutation.isPending}
            >
              {generateRoutingMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Route className="h-4 w-4 mr-2" />
                  Create Part Routing
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Library Picker for importing reference documents */}
      <MediaLibraryPicker
        open={showMediaLibraryPicker}
        onOpenChange={setShowMediaLibraryPicker}
        onSelect={(url, filename) => {
          importFromLibraryMutation.mutate({ fileUrl: url, filename });
        }}
        acceptedTypes={['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']}
        title="Select Reference Document from Media Library"
      />

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>Update the document details below</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Document title"
              />
            </div>
            <div>
              <Label>Part Number</Label>
              <Input
                value={editForm.partNumber}
                onChange={(e) => setEditForm({ ...editForm, partNumber: e.target.value })}
                placeholder="e.g., AG-1001"
              />
            </div>
            <div>
              <Label>Department</Label>
              <Input
                value={editForm.departmentName}
                onChange={(e) => setEditForm({ ...editForm, departmentName: e.target.value })}
                placeholder="e.g., Layup, Trim, Paint"
              />
            </div>
            <div>
              <Label>Document Type</Label>
              <Select value={editForm.documentType} onValueChange={(v) => setEditForm({ ...editForm, documentType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="editIsTemplate"
                checked={editForm.isTemplate}
                onCheckedChange={(checked) => setEditForm({ ...editForm, isTemplate: checked === true })}
              />
              <Label htmlFor="editIsTemplate">Mark as Template</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedDocument || !editForm.title.trim()) {
                  toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
                  return;
                }
                updateDocMutation.mutate({ id: selectedDocument.id, ...editForm });
              }}
              disabled={updateDocMutation.isPending}
            >
              {updateDocMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{deleteTarget?.title}". This action cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {(deleteDocMutation.isPending || deleteTemplateMutation.isPending || deleteSpecSheetMutation.isPending)
                ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showEditTemplateDialog} onOpenChange={setShowEditTemplateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Update the template details below</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={editTemplateForm.templateName}
                onChange={(e) => setEditTemplateForm({ ...editTemplateForm, templateName: e.target.value })}
                placeholder="Template name"
              />
            </div>
            <div>
              <Label>Template Type</Label>
              <Select value={editTemplateForm.templateType} onValueChange={(v) => setEditTemplateForm({ ...editTemplateForm, templateType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editTemplateForm.description}
                onChange={(e) => setEditTemplateForm({ ...editTemplateForm, description: e.target.value })}
                placeholder="Template description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditTemplateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedTemplate || !editTemplateForm.templateName.trim()) {
                  toast({ title: 'Error', description: 'Template name is required', variant: 'destructive' });
                  return;
                }
                updateTemplateMutation.mutate({ id: selectedTemplate.id, ...editTemplateForm });
              }}
              disabled={updateTemplateMutation.isPending}
            >
              {updateTemplateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewTemplateDialog} onOpenChange={setShowViewTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.templateName}</DialogTitle>
            <DialogDescription>{selectedTemplate?.description || 'No description'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{typeLabel(selectedTemplate?.templateType)}</Badge>
              <Badge variant="secondary">Learned from {selectedTemplate?.learnedFromCount || 0} docs</Badge>
            </div>
            {selectedTemplate?.sections && selectedTemplate.sections.length > 0 && (
              <div>
                <Label className="text-sm font-semibold">Sections</Label>
                <div className="mt-1 space-y-1">
                  {selectedTemplate.sections.map((section: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">{i + 1}</Badge>
                      <span className="font-medium">{section.name}</span>
                      {section.description && <span className="text-muted-foreground">— {section.description}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedTemplate?.defaultFields && selectedTemplate.defaultFields.length > 0 && (
              <div>
                <Label className="text-sm font-semibold">Fields ({selectedTemplate.defaultFields.length})</Label>
                <ScrollArea className="h-[200px] mt-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead>Required</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTemplate.defaultFields.map((field: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{field.fieldLabel || field.fieldName}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{field.fieldType}</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{field.sectionName || '-'}</TableCell>
                          <TableCell>{field.isRequired ? <CheckCircle className="h-4 w-4 text-green-600" /> : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Created: {selectedTemplate?.createdAt ? new Date(selectedTemplate.createdAt).toLocaleString() : '-'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewTemplateDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditSpecSheetDialog} onOpenChange={setShowEditSpecSheetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Spec Sheet</DialogTitle>
            <DialogDescription>Update the spec sheet details below</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={editSpecSheetForm.title}
                onChange={(e) => setEditSpecSheetForm({ ...editSpecSheetForm, title: e.target.value })}
                placeholder="Spec sheet title"
              />
            </div>
            <div>
              <Label>Part Number</Label>
              <Input
                value={editSpecSheetForm.partNumber}
                onChange={(e) => setEditSpecSheetForm({ ...editSpecSheetForm, partNumber: e.target.value })}
                placeholder="e.g., AG-1001"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="editSpecIsTemplate"
                checked={editSpecSheetForm.isTemplate}
                onCheckedChange={(checked) => setEditSpecSheetForm({ ...editSpecSheetForm, isTemplate: checked === true })}
              />
              <Label htmlFor="editSpecIsTemplate">Mark as Template</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditSpecSheetDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedSpecSheet || !editSpecSheetForm.title.trim()) {
                  toast({ title: 'Error', description: 'Title is required', variant: 'destructive' });
                  return;
                }
                updateSpecSheetMutation.mutate({ id: selectedSpecSheet.id, ...editSpecSheetForm });
              }}
              disabled={updateSpecSheetMutation.isPending}
            >
              {updateSpecSheetMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewSpecSheetDialog} onOpenChange={setShowViewSpecSheetDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSpecSheet?.title}</DialogTitle>
            <DialogDescription>Spec Sheet Details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold">Part Number</Label>
                <p className="text-sm text-muted-foreground">{selectedSpecSheet?.partNumber || 'Not specified'}</p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Template</Label>
                <p className="text-sm">{selectedSpecSheet?.isTemplate ? <Badge>Yes</Badge> : 'No'}</p>
              </div>
            </div>
            {selectedSpecSheet?.specifications && (
              <div>
                <Label className="text-sm font-semibold">Specifications</Label>
                <ScrollArea className="h-[200px] mt-1">
                  <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap">
                    {JSON.stringify(selectedSpecSheet.specifications, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Created: {selectedSpecSheet?.createdAt ? new Date(selectedSpecSheet.createdAt).toLocaleString() : '-'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewSpecSheetDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
