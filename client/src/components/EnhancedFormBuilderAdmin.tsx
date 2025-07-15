import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, useDraggable, useDroppable, DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import SignaturePad from 'signature_pad';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  Eye, 
  Move, 
  Settings,
  Type,
  MousePointer,
  PenTool,
  Database,
  Repeat,
  ChevronDown,
  Grid3x3
} from 'lucide-react';

import * as catAPI from '@/api/categories';
import * as schemaAPI from '@/api/schema';
import * as formAPI from '@/api/enhancedForms';
import { apiRequest } from '@/lib/queryClient';

interface FormElement {
  id: string;
  type: 'text' | 'input' | 'signature' | 'column' | 'repeat' | 'dropdown' | 'textarea' | 'checkbox';
  x: number;
  y: number;
  width: number;
  height: number;
  config: {
    label?: string;
    required?: boolean;
    visibleIf?: string;
    table?: string;
    column?: string;
    text?: string;
    placeholder?: string;
    options?: string[];
    key?: string;
    _sigPad?: any;
  };
}

interface Category {
  id: number;
  name: string;
  description?: string;
}

interface DatabaseTable {
  name: string;
  label: string;
  description?: string;
}

interface DatabaseColumn {
  name: string;
  label: string;
  type: string;
  nullable: boolean;
}

interface EnhancedForm {
  id: number;
  name: string;
  description?: string;
  categoryId?: number;
  tableName?: string;
  layout: FormElement[];
  version: number;
}

interface FormVersion {
  id: number;
  formId: number;
  version: number;
  layout: FormElement[];
  createdAt: string;
}

// Draggable Component
function Draggable({ id, children, style }: { id: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });

  const dragStyle = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    ...style
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...listeners}
      {...attributes}
      className="cursor-move"
    >
      {children}
    </div>
  );
}

// Canvas Component
function Canvas({ 
  elements, 
  selectedElId, 
  onElementSelect,
  onElementMove 
}: { 
  elements: FormElement[];
  selectedElId: string | null;
  onElementSelect: (id: string) => void;
  onElementMove: (id: string, x: number, y: number) => void;
}) {
  const { setNodeRef } = useDroppable({ id: 'canvas' });

  return (
    <div
      ref={setNodeRef}
      className="relative w-full h-[600px] bg-white border-2 border-dashed border-gray-300 rounded-lg overflow-hidden"
    >
      <div className="absolute top-2 left-2 text-xs text-gray-500">
        Drag elements here to build your form
      </div>

      {elements.map(el => (
        <Draggable
          key={el.id}
          id={el.id}
          style={{
            position: 'absolute',
            left: el.x,
            top: el.y,
            width: el.width,
            height: el.height,
            border: selectedElId === el.id ? '2px solid #3b82f6' : '1px solid #d1d5db',
            padding: '8px',
            background: '#f9fafb',
            borderRadius: '4px',
            cursor: 'move'
          }}
        >
          <div 
            onClick={() => onElementSelect(el.id)}
            className="h-full w-full flex items-center justify-center"
          >
            {el.type === 'text' && (
              <div className="text-sm font-medium">
                {el.config.text || 'Text Element'}
              </div>
            )}
            {el.type === 'input' && (
              <Input 
                placeholder={el.config.label || 'Input Field'} 
                className="pointer-events-none"
              />
            )}
            {el.type === 'textarea' && (
              <Textarea 
                placeholder={el.config.label || 'Textarea Field'} 
                className="pointer-events-none resize-none"
              />
            )}
            {el.type === 'signature' && (
              <div className="w-full h-full border border-gray-300 rounded flex items-center justify-center text-xs text-gray-500">
                <PenTool className="h-4 w-4 mr-1" />
                Signature Pad
              </div>
            )}
            {el.type === 'column' && (
              <div className="flex items-center text-xs text-gray-600">
                <Database className="h-4 w-4 mr-1" />
                {el.config.column || 'Database Column'}
              </div>
            )}
            {el.type === 'dropdown' && (
              <Select disabled>
                <SelectTrigger className="pointer-events-none">
                  <SelectValue placeholder={el.config.label || 'Dropdown'} />
                </SelectTrigger>
              </Select>
            )}
            {el.type === 'repeat' && (
              <div className="flex items-center text-xs text-gray-600">
                <Repeat className="h-4 w-4 mr-1" />
                Repeat Group
              </div>
            )}
            {el.type === 'checkbox' && (
              <div className="flex items-center space-x-2">
                <input type="checkbox" className="pointer-events-none" />
                <span className="text-sm">{el.config.label || 'Checkbox'}</span>
              </div>
            )}
          </div>
        </Draggable>
      ))}
    </div>
  );
}

export default function EnhancedFormBuilderAdmin() {
  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [catEditing, setCatEditing] = useState<Category | null>(null);
  const [newCat, setNewCat] = useState('');

  // Forms state
  const [forms, setForms] = useState<EnhancedForm[]>([]);
  const [versions, setVersions] = useState<FormVersion[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [formDef, setFormDef] = useState<Partial<EnhancedForm> | null>(null);
  const [formVersion, setFormVersion] = useState<number | null>(null);

  // Schema discovery
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [columns, setColumns] = useState<DatabaseColumn[]>([]);

  // Canvas state
  const [elements, setElements] = useState<FormElement[]>([]);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Fetch categories and forms on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [categoriesRes, formsRes] = await Promise.all([
          apiRequest('/api/enhanced-forms/categories'),
          apiRequest('/api/enhanced-forms')
        ]);
        setCategories(categoriesRes);
        setForms(formsRes);
      } catch (error) {
        toast.error('Failed to load data');
      }
    };
    fetchData();
  }, []);

  // Load tables when category selected
  useEffect(() => {
    if (!formDef?.categoryId) return;

    const fetchTables = async () => {
      try {
        const response = await apiRequest('/api/enhanced-forms/schema', {
          params: { category: formDef.categoryId }
        });
        setTables(response.tables || []);
      } catch (error) {
        toast.error('Failed to load tables');
      }
    };
    fetchTables();
  }, [formDef?.categoryId]);

  // Load columns when table chosen
  useEffect(() => {
    if (!formDef?.tableName) return;

    const fetchColumns = async () => {
      try {
        const response = await apiRequest(`/api/enhanced-forms/schema/${formDef.tableName}/columns`);
        setColumns(response.columns || []);
      } catch (error) {
        toast.error('Failed to load columns');
      }
    };
    fetchColumns();
  }, [formDef?.tableName]);

  // Category CRUD operations
  const saveCategory = async () => {
    try {
      if (!catEditing) {
        const response = await apiRequest('/api/enhanced-forms/categories', {
          method: 'POST',
          body: { name: newCat, description: '' }
        });
        setCategories([...categories, response]);
        toast.success('Category created');
      } else {
        const response = await apiRequest(`/api/enhanced-forms/categories/${catEditing.id}`, {
          method: 'PUT',
          body: { name: newCat }
        });
        setCategories(categories.map(c => c.id === response.id ? response : c));
        toast.success('Category updated');
      }
      setNewCat('');
      setCatEditing(null);
    } catch (error) {
      toast.error('Failed to save category');
    }
  };

  const deleteCategory = async (id: number) => {
    if (!confirm('Delete category? This will also delete all associated forms.')) return;

    try {
      await apiRequest(`/api/enhanced-forms/categories/${id}`, { method: 'DELETE' });
      setCategories(categories.filter(c => c.id !== id));
      toast.success('Category deleted');
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  // Form operations
  const loadForm = async (id: number) => {
    try {
      setSelectedFormId(id);
      const [formRes, versionsRes] = await Promise.all([
        apiRequest(`/api/enhanced-forms/${id}`),
        apiRequest(`/api/enhanced-forms/${id}/versions`)
      ]);
      setFormDef(formRes);
      setElements(formRes.layout || []);
      setVersions(versionsRes);
    } catch (error) {
      toast.error('Failed to load form');
    }
  };

  const loadVersion = async (version: number) => {
    if (!selectedFormId) return;

    try {
      const response = await apiRequest(`/api/enhanced-forms/${selectedFormId}/versions/${version}`);
      setFormVersion(version);
      setFormDef(response);
      setElements(response.layout || []);
    } catch (error) {
      toast.error('Failed to load version');
    }
  };

  // Element operations
  const addElement = (type: FormElement['type']) => {
    const id = `${type}-${Date.now()}`;
    const baseElement: FormElement = {
      id,
      type,
      x: 20,
      y: 20,
      width: 200,
      height: type === 'textarea' ? 80 : type === 'signature' ? 100 : 50,
      config: {}
    };

    if (type === 'column' && formDef?.tableName) {
      baseElement.config.table = formDef.tableName;
    }

    setElements([...elements, baseElement]);
    setSelectedElId(id);
  };

  const updateElement = (id: string, updates: Partial<FormElement>) => {
    setElements(elements.map(el => 
      el.id === id ? { ...el, ...updates } : el
    ));
  };

  const deleteElement = (id: string) => {
    setElements(elements.filter(el => el.id !== id));
    if (selectedElId === id) {
      setSelectedElId(null);
    }
  };

  // Save form
  const saveForm = async () => {
    if (!formDef?.name) {
      toast.error('Form name is required');
      return;
    }

    try {
      const formData = {
        ...formDef,
        layout: elements
      };

      if (!selectedFormId) {
        // Create new form
        const response = await apiRequest('/api/enhanced-forms', {
          method: 'POST',
          body: formData
        });
        setForms([...forms, response]);
        setSelectedFormId(response.id);
        toast.success('Form created');
      } else {
        // Update existing form
        await apiRequest(`/api/enhanced-forms/${selectedFormId}`, {
          method: 'PUT',
          body: formData
        });
        toast.success('Form saved');
      }
    } catch (error) {
      toast.error('Failed to save form');
    }
  };

  // Get selected element
  const selectedElement = selectedElId ? elements.find(el => el.id === selectedElId) : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Enhanced Form Builder</h1>
        <Button onClick={saveForm} disabled={!formDef?.name}>
          <Save className="h-4 w-4 mr-2" />
          Save Form
        </Button>
      </div>

      {/* Category Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid3x3 className="h-5 w-5" />
            Categories
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map(cat => (
              <Badge key={cat.id} variant="outline" className="flex items-center gap-1">
                {cat.name}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0"
                  onClick={() => { setCatEditing(cat); setNewCat(cat.name); }}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0"
                  onClick={() => deleteCategory(cat.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="Category name"
              className="flex-1"
            />
            <Button onClick={saveCategory} disabled={!newCat.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              {catEditing ? 'Update' : 'Add'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Form Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Form Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center">
            <Select 
              value={selectedFormId?.toString() || ''} 
              onValueChange={(value) => value ? loadForm(parseInt(value)) : setSelectedFormId(null)}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select or create new form" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">— Create New Form —</SelectItem>
                {forms.map(form => (
                  <SelectItem key={form.id} value={form.id.toString()}>
                    {form.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedFormId && versions.length > 0 && (
              <Select 
                value={formVersion?.toString() || 'latest'} 
                onValueChange={(value) => value !== 'latest' ? loadVersion(parseInt(value)) : setFormVersion(null)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Latest Version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">— Latest Version —</SelectItem>
                  {versions.map(version => (
                    <SelectItem key={version.version} value={version.version.toString()}>
                      v{version.version} ({new Date(version.createdAt).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Form Properties */}
      {(selectedFormId === null || formDef) && (
        <Card>
          <CardHeader>
            <CardTitle>Form Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="form-name">Form Name</Label>
                <Input
                  id="form-name"
                  value={formDef?.name || ''}
                  onChange={(e) => setFormDef(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter form name"
                />
              </div>
              <div>
                <Label htmlFor="form-description">Description</Label>
                <Input
                  id="form-description"
                  value={formDef?.description || ''}
                  onChange={(e) => setFormDef(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Form description"
                />
              </div>
              <div>
                <Label htmlFor="form-category">Category</Label>
                <Select 
                  value={formDef?.categoryId?.toString() || 'none'} 
                  onValueChange={(value) => {
                    setFormDef(prev => ({ ...prev, categoryId: value !== 'none' ? parseInt(value) : undefined }));
                    setTables([]);
                    setColumns([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select Category —</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="form-table">Database Table</Label>
                <Select 
                  value={formDef?.tableName || 'none'} 
                  onValueChange={(value) => setFormDef(prev => ({ ...prev, tableName: value !== 'none' ? value : undefined }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select table" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select Table —</SelectItem>
                    {tables.map(table => (
                      <SelectItem key={table.name} value={table.name}>
                        {table.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Element Toolbar */}
      {formDef?.categoryId && (
        <Card>
          <CardHeader>
            <CardTitle>Add Elements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => addElement('text')} variant="outline" size="sm">
                <Type className="h-4 w-4 mr-2" />
                Text
              </Button>
              <Button onClick={() => addElement('input')} variant="outline" size="sm">
                <MousePointer className="h-4 w-4 mr-2" />
                Input
              </Button>
              <Button onClick={() => addElement('textarea')} variant="outline" size="sm">
                <MousePointer className="h-4 w-4 mr-2" />
                Textarea
              </Button>
              <Button onClick={() => addElement('dropdown')} variant="outline" size="sm">
                <ChevronDown className="h-4 w-4 mr-2" />
                Dropdown
              </Button>
              <Button onClick={() => addElement('checkbox')} variant="outline" size="sm">
                <MousePointer className="h-4 w-4 mr-2" />
                Checkbox
              </Button>
              <Button onClick={() => addElement('signature')} variant="outline" size="sm">
                <PenTool className="h-4 w-4 mr-2" />
                Signature
              </Button>
              <Button onClick={() => addElement('column')} variant="outline" size="sm">
                <Database className="h-4 w-4 mr-2" />
                DB Column
              </Button>
              <Button onClick={() => addElement('repeat')} variant="outline" size="sm">
                <Repeat className="h-4 w-4 mr-2" />
                Repeat Group
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Canvas Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Form Canvas</CardTitle>
            </CardHeader>
            <CardContent>
              <DndContext onDragEnd={(event: DragEndEvent) => {
                const { active, delta } = event;
                if (delta.x === 0 && delta.y === 0) return;

                const element = elements.find(el => el.id === active.id);
                if (element) {
                  updateElement(element.id, {
                    x: element.x + delta.x,
                    y: element.y + delta.y
                  });
                }
              }}>
                <Canvas
                  elements={elements}
                  selectedElId={selectedElId}
                  onElementSelect={setSelectedElId}
                  onElementMove={(id, x, y) => updateElement(id, { x, y })}
                />
              </DndContext>
            </CardContent>
          </Card>
        </div>

        {/* Element Properties Panel */}
        <div className="lg:col-span-1">
          {selectedElement && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Element Properties</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteElement(selectedElement.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Element Type</Label>
                  <Badge variant="outline">{selectedElement.type}</Badge>
                </div>

                {['input', 'textarea', 'dropdown', 'checkbox', 'column', 'repeat'].includes(selectedElement.type) && (
                  <div>
                    <Label htmlFor="element-label">Label</Label>
                    <Input
                      id="element-label"
                      value={selectedElement.config.label || ''}
                      onChange={(e) => updateElement(selectedElement.id, {
                        config: { ...selectedElement.config, label: e.target.value }
                      })}
                      placeholder="Element label"
                    />
                  </div>
                )}

                {selectedElement.type === 'text' && (
                  <div>
                    <Label htmlFor="element-text">Text Content</Label>
                    <Textarea
                      id="element-text"
                      value={selectedElement.config.text || ''}
                      onChange={(e) => updateElement(selectedElement.id, {
                        config: { ...selectedElement.config, text: e.target.value }
                      })}
                      placeholder="Text content"
                    />
                  </div>
                )}

                {selectedElement.type === 'column' && (
                  <div>
                    <Label htmlFor="element-column">Column</Label>
                    <Select 
                      value={selectedElement.config.column || ''} 
                      onValueChange={(value) => updateElement(selectedElement.id, {
                        config: { ...selectedElement.config, column: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map(col => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="element-required"
                    checked={selectedElement.config.required || false}
                    onChange={(e) => updateElement(selectedElement.id, {
                      config: { ...selectedElement.config, required: e.target.checked }
                    })}
                  />
                  <Label htmlFor="element-required">Required</Label>
                </div>

                <div>
                  <Label htmlFor="element-visible-if">Visible If</Label>
                  <Input
                    id="element-visible-if"
                    value={selectedElement.config.visibleIf || ''}
                    onChange={(e) => updateElement(selectedElement.id, {
                      config: { ...selectedElement.config, visibleIf: e.target.value }
                    })}
                    placeholder="e.g. quantity > 0"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="element-width">Width</Label>
                    <Input
                      id="element-width"
                      type="number"
                      value={selectedElement.width}
                      onChange={(e) => updateElement(selectedElement.id, {
                        width: parseInt(e.target.value) || 200
                      })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="element-height">Height</Label>
                    <Input
                      id="element-height"
                      type="number"
                      value={selectedElement.height}
                      onChange={(e) => updateElement(selectedElement.id, {
                        height: parseInt(e.target.value) || 50
                      })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}