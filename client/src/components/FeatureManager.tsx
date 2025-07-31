import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, Plus, Edit, Trash2, Save, X, ChevronUp, ChevronDown } from 'lucide-react';

interface FeatureOption {
  value: string;
  label: string;
  description?: string;
  price?: number;
}

interface Feature {
  id: string;
  name: string;
  displayName: string;
  type: 'dropdown' | 'text' | 'number' | 'checkbox' | 'textarea' | 'multiselect';
  required: boolean;
  placeholder?: string;
  options?: FeatureOption[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  category: string;
  price: number;
  sortOrder: number;
  isActive: boolean;
}

interface FeatureCategory {
  id: string;
  name: string;
  displayName: string;
  sortOrder: number;
  isActive: boolean;
}

interface FeatureSubCategory {
  id: string;
  name: string;
  displayName: string;
  categoryId: string;
  price: number;
  sortOrder: number;
  isActive: boolean;
}

export default function FeatureManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FeatureCategory | null>(null);
  const [isFeatureDialogOpen, setIsFeatureDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: string; id: string } | null>(null);

  // Form states
  const [featureForm, setFeatureForm] = useState<Partial<Feature>>({
    type: 'dropdown',
    required: false,
    category: '',
    price: 0,
    sortOrder: 0,
    isActive: true,
    options: []
  });

  const [categoryForm, setCategoryForm] = useState<Partial<FeatureCategory>>({
    name: '',
    displayName: '',
    sortOrder: 0,
    isActive: true
  });

  const [subCategoryForm, setSubCategoryForm] = useState<Partial<FeatureSubCategory>>({
    name: '',
    displayName: '',
    categoryId: '',
    price: 0,
    sortOrder: 0,
    isActive: true
  });

  const [isSubCategoryDialogOpen, setIsSubCategoryDialogOpen] = useState(false);
  const [selectedSubCategory, setSelectedSubCategory] = useState<FeatureSubCategory | null>(null);
  const [isEditingSubCategory, setIsEditingSubCategory] = useState(false);
  const [isPaintOptionsModalOpen, setIsPaintOptionsModalOpen] = useState(false);
  const [selectedPaintSubCategory, setSelectedPaintSubCategory] = useState<string>('');

  // Fetch features and categories
  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ['/api/features'],
    queryFn: () => apiRequest('/api/features')
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['/api/feature-categories'],
    queryFn: () => apiRequest('/api/feature-categories')
  });

  const { data: subCategories = [], isLoading: subCategoriesLoading } = useQuery({
    queryKey: ['/api/feature-sub-categories'],
    queryFn: () => apiRequest('/api/feature-sub-categories')
  });

  // Feature mutations
  const createFeatureMutation = useMutation({
    mutationFn: (data: Partial<Feature>) => apiRequest('/api/features', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/features'] });
      setIsFeatureDialogOpen(false);
      resetFeatureForm();
      toast({ title: "Feature created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create feature", variant: "destructive" });
    }
  });

  const updateFeatureMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Feature> }) => 
      apiRequest(`/api/features/${id}`, {
        method: 'PUT',
        body: data
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/features'] });
      setIsFeatureDialogOpen(false);
      resetFeatureForm();
      toast({ title: "Feature updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update feature", variant: "destructive" });
    }
  });

  const deleteFeatureMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/features/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/features'] });
      toast({ title: "Feature deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete feature", variant: "destructive" });
    }
  });

  // Category mutations
  const createCategoryMutation = useMutation({
    mutationFn: (data: Partial<FeatureCategory>) => apiRequest('/api/feature-categories', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-categories'] });
      setIsCategoryDialogOpen(false);
      resetCategoryForm();
      toast({ title: "Category created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create category", variant: "destructive" });
    }
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FeatureCategory> }) => 
      apiRequest(`/api/feature-categories/${id}`, {
        method: 'PUT',
        body: data
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-categories'] });
      setIsCategoryDialogOpen(false);
      resetCategoryForm();
      toast({ title: "Category updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update category", variant: "destructive" });
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/feature-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-categories'] });
      toast({ title: "Category deleted successfully" });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || "Failed to delete category";
      toast({ 
        title: "Cannot delete category", 
        description: errorMessage,
        variant: "destructive" 
      });
    }
  });

  // Sub-Category mutations
  const createSubCategoryMutation = useMutation({
    mutationFn: (data: Partial<FeatureSubCategory>) => apiRequest('/api/feature-sub-categories', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-sub-categories'] });
      setIsSubCategoryDialogOpen(false);
      resetSubCategoryForm();
      toast({ title: "Sub-category created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create sub-category", variant: "destructive" });
    }
  });

  const updateSubCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FeatureSubCategory> }) => 
      apiRequest(`/api/feature-sub-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-sub-categories'] });
      setIsSubCategoryDialogOpen(false);
      resetSubCategoryForm();
      toast({ title: "Sub-category updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update sub-category", variant: "destructive" });
    }
  });

  const deleteSubCategoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/feature-sub-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-sub-categories'] });
      toast({ title: "Sub-category deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete sub-category", variant: "destructive" });
    }
  });

  const resetFeatureForm = () => {
    setFeatureForm({
      type: 'dropdown',
      required: false,
      category: '',
      price: 0,
      sortOrder: 0,
      isActive: true,
      options: []
    });
    setSelectedFeature(null);
    setIsEditing(false);
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: '',
      displayName: '',
      sortOrder: 0,
      isActive: true
    });
    setSelectedCategory(null);
    setIsEditing(false);
  };

  const resetSubCategoryForm = () => {
    setSubCategoryForm({
      name: '',
      displayName: '',
      categoryId: '',
      sortOrder: 0,
      isActive: true
    });
    setSelectedSubCategory(null);
    setIsEditingSubCategory(false);
  };

  const handleEditFeature = (feature: Feature) => {
    setSelectedFeature(feature);
    // Only set editable fields, exclude read-only fields
    setFeatureForm({
      name: feature.name,
      displayName: feature.displayName,
      type: feature.type,
      required: feature.required,
      placeholder: feature.placeholder,
      options: feature.options,
      validation: feature.validation,
      category: feature.category,
      price: feature.price,
      sortOrder: feature.sortOrder,
      isActive: feature.isActive
    });
    setIsEditing(true);
    setIsFeatureDialogOpen(true);
  };

  const handleEditCategory = (category: FeatureCategory) => {
    setSelectedCategory(category);
    setCategoryForm({
      name: category.name,
      displayName: category.displayName,
      sortOrder: category.sortOrder,
      isActive: category.isActive
    });
    setIsEditing(true);
    setIsCategoryDialogOpen(true);
  };

  const handleEditSubCategory = (subCategory: FeatureSubCategory) => {
    setSelectedSubCategory(subCategory);
    setSubCategoryForm({
      name: subCategory.name,
      displayName: subCategory.displayName,
      categoryId: subCategory.categoryId,
      price: subCategory.price || 0,
      sortOrder: subCategory.sortOrder,
      isActive: subCategory.isActive
    });
    setIsEditingSubCategory(true);
    setIsSubCategoryDialogOpen(true);
  };

  const handleFeatureSubmit = () => {
    // Ensure sortOrder is a valid number
    const formData = {
      ...featureForm,
      sortOrder: featureForm.sortOrder || 0,
      price: featureForm.price || 0
    };

    if (isEditing && selectedFeature) {
      updateFeatureMutation.mutate({ id: selectedFeature.id, data: formData });
    } else {
      createFeatureMutation.mutate(formData);
    }
  };

  const handleCategorySubmit = () => {
    if (isEditing && selectedCategory) {
      updateCategoryMutation.mutate({ id: selectedCategory.id, data: categoryForm });
    } else {
      createCategoryMutation.mutate(categoryForm);
    }
  };

  const handleSubCategorySubmit = () => {
    if (isEditingSubCategory && selectedSubCategory) {
      updateSubCategoryMutation.mutate({ id: selectedSubCategory.id, data: subCategoryForm });
    } else {
      createSubCategoryMutation.mutate(subCategoryForm);
    }
  };

  const addOption = () => {
    setFeatureForm(prev => ({
      ...prev,
      options: [...(prev.options || []), { value: '', label: '', price: 0 }]
    }));
  };

  const updateOption = (index: number, field: 'value' | 'label' | 'description' | 'price', value: string | number) => {
    setFeatureForm(prev => ({
      ...prev,
      options: prev.options?.map((option, i) => 
        i === index ? { ...option, [field]: value } : option
      )
    }));
  };

  const removeOption = (index: number) => {
    setFeatureForm(prev => ({
      ...prev,
      options: prev.options?.filter((_, i) => i !== index)
    }));
  };

  const moveOptionUp = (index: number) => {
    if (index === 0) return;
    setFeatureForm(prev => ({
      ...prev,
      options: prev.options?.map((option, i) => {
        if (i === index) return prev.options![i - 1];
        if (i === index - 1) return prev.options![i + 1];
        return option;
      })
    }));
  };

  const moveOptionDown = (index: number) => {
    if (!featureForm.options || index === featureForm.options.length - 1) return;
    setFeatureForm(prev => ({
      ...prev,
      options: prev.options?.map((option, i) => {
        if (i === index) return prev.options![i + 1];
        if (i === index + 1) return prev.options![i - 1];
        return option;
      })
    }));
  };

  const categorizedFeatures = features.reduce((acc: Record<string, Feature[]>, feature: Feature) => {
    if (!acc[feature.category]) {
      acc[feature.category] = [];
    }
    acc[feature.category].push(feature);
    return acc;
  }, {});

  const handleSecureFeatureDelete = (feature: Feature) => {
    setItemToDelete({ type: 'feature', id: feature.id });
    setIsDeleteDialogOpen(true);
  };

  const handleSecureCategoryDelete = (category: FeatureCategory) => {
    setItemToDelete({ type: 'category', id: category.id });
    setIsDeleteDialogOpen(true);
  };

  const handleSecureSubCategoryDelete = (subCategory: FeatureSubCategory) => {
    setItemToDelete({ type: 'subCategory', id: subCategory.id });
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!itemToDelete) return;

    switch (itemToDelete.type) {
      case 'feature':
        deleteFeatureMutation.mutate(itemToDelete.id);
        break;
      case 'category':
        deleteCategoryMutation.mutate(itemToDelete.id);
        break;
      case 'subCategory':
        deleteSubCategoryMutation.mutate(itemToDelete.id);
        break;
      default:
        break;
    }

    setIsDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Settings className="h-8 w-8 text-primary" />
            Feature Manager
          </h1>
          <p className="text-gray-600 mt-2">Manage dynamic features for order entry</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={() => { resetCategoryForm(); setIsCategoryDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
          </Dialog>
          <Dialog open={isFeatureDialogOpen} onOpenChange={setIsFeatureDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetFeatureForm(); setIsFeatureDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Feature
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </div>

      {/* Categories Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Feature Categories</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Sort Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category: FeatureCategory) => (
                <TableRow key={category.id}>
                  <TableCell>{category.name}</TableCell>
                  <TableCell>{category.displayName}</TableCell>
                  <TableCell>{category.sortOrder}</TableCell>
                  <TableCell>
                    <Badge variant={category.isActive ? "default" : "secondary"}>
                      {category.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleEditCategory(category)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleSecureCategoryDelete(category)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Features Section */}
      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.entries(categorizedFeatures).map(([categoryId, categoryFeatures]) => {
            const category = categories.find((c: FeatureCategory) => c.id === categoryId);
            return (
              <div key={categoryId} className="mb-6">
                <h3 className="text-lg font-semibold mb-3">
                  {category?.displayName || 'Uncategorized'}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Sort Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryFeatures.map((feature: Feature) => (
                      <TableRow key={feature.id}>
                        <TableCell>{feature.displayName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{feature.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={feature.required ? "destructive" : "secondary"}>
                            {feature.required ? 'Required' : 'Optional'}
                          </Badge>
                        </TableCell>
                        <TableCell>{feature.sortOrder}</TableCell>
                        <TableCell>
                          <Badge variant={feature.isActive ? "default" : "secondary"}>
                            {feature.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleEditFeature(feature)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleSecureFeatureDelete(feature)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Feature Dialog */}
      <Dialog open={isFeatureDialogOpen} onOpenChange={setIsFeatureDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Feature' : 'Add New Feature'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name (ID)</Label>
                <Input
                  value={featureForm.name || ''}
                  onChange={(e) => setFeatureForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="barrel_length"
                />
              </div>
              <div>
                <Label>Display Name</Label>
                <Input
                  value={featureForm.displayName || ''}
                  onChange={(e) => setFeatureForm(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Barrel Length"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={featureForm.type || 'dropdown'}
                  onValueChange={(value) => setFeatureForm(prev => ({ ...prev, type: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dropdown">Dropdown</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                    <SelectItem value="textarea">Textarea</SelectItem>
                    <SelectItem value="multiselect">Multiselect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={featureForm.category || ''}
                  onValueChange={(value) => {
                    if (value === 'paint_options') {
                      setIsPaintOptionsModalOpen(true);
                    } else {
                      setFeatureForm(prev => ({ ...prev, category: value }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category: FeatureCategory) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={featureForm.sortOrder || 0}
                  onChange={(e) => setFeatureForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>Placeholder</Label>
                <Input
                  value={featureForm.placeholder || ''}
                  onChange={(e) => setFeatureForm(prev => ({ ...prev, placeholder: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="required"
                  checked={featureForm.required || false}
                  onCheckedChange={(checked) => setFeatureForm(prev => ({ ...prev, required: checked as boolean }))}
                />
                <Label htmlFor="required">Required</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="active"
                  checked={featureForm.isActive !== false}
                  onCheckedChange={(checked) => setFeatureForm(prev => ({ ...prev, isActive: checked as boolean }))}
                />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>

            {/* Options for dropdown and checkbox */}
            {(featureForm.type === 'dropdown' || featureForm.type === 'checkbox' || featureForm.type === 'multiselect') && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Options</Label>
                  <Button variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Option
                  </Button>
                </div>
                {featureForm.options?.map((option, index) => (
                  <div key={index} className="grid grid-cols-4 gap-2 mb-2">
                    <Input
                      placeholder="Value"
                      value={option.value}
                      onChange={(e) => updateOption(index, 'value', e.target.value)}
                    />
                    <Input
                      placeholder="Label"
                      value={option.label}
                      onChange={(e) => updateOption(index, 'label', e.target.value)}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={option.price || 0}
                      onChange={(e) => updateOption(index, 'price', parseFloat(e.target.value) || 0)}
                    />
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveOptionUp(index)}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveOptionDown(index)}
                        disabled={!featureForm.options || index === featureForm.options.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsFeatureDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleFeatureSubmit}>
                <Save className="h-4 w-4 mr-2" />
                {isEditing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Category' : 'Add New Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name (ID)</Label>
                <Input
                  value={categoryForm.name || ''}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="barrel_options"
                />
              </div>
              <div>
                <Label>Display Name</Label>
                <Input
                  value={categoryForm.displayName || ''}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Barrel Options"
                />
              </div>
            </div>

            <div>
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={categoryForm.sortOrder || 0}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) }))}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="category-active"
                checked={categoryForm.isActive !== false}
                onCheckedChange={(checked) => setCategoryForm(prev => ({ ...prev, isActive: checked as boolean }))}
              />
              <Label htmlFor="category-active">Active</Label>
            </div>

            {/* Sub-Categories Management - Only show for paint_options category */}
            {selectedCategory && selectedCategory.id === 'paint_options' && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Sub-Categories</h3>
                  <Button 
                    size="sm"
                    onClick={() => {
                      setSubCategoryForm({ 
                        name: '', 
                        displayName: '', 
                        categoryId: 'paint_options', 
                        price: 0,
                        sortOrder: (subCategories.filter(sc => sc.categoryId === 'paint_options').length + 1), 
                        isActive: true 
                      });
                      setIsEditingSubCategory(false);
                      setIsSubCategoryDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Sub-Category
                  </Button>
                </div>

                <div className="space-y-2">
                  {subCategories
                    .filter(sc => sc.categoryId === 'paint_options')
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((subCategory) => (
                      <div key={subCategory.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">{subCategory.displayName}</span>
                          <span className="text-xs text-gray-500">({subCategory.name})</span>
                          {!subCategory.isActive && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditSubCategory(subCategory)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSecureSubCategoryDelete(subCategory)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCategorySubmit}>
                <Save className="h-4 w-4 mr-2" />
                {isEditing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-Category Dialog */}
      <Dialog open={isSubCategoryDialogOpen} onOpenChange={setIsSubCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditingSubCategory ? 'Edit Sub-Category' : 'Add New Sub-Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name (ID)</Label>
                <Input
                  value={subCategoryForm.name || ''}
                  onChange={(e) => setSubCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="base_colors"
                />
              </div>
              <div>
                <Label>Display Name</Label>
                <Input
                  value={subCategoryForm.displayName || ''}
                  onChange={(e) => setSubCategoryForm(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Base Colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={subCategoryForm.price || 0}
                  onChange={(e) => setSubCategoryForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={subCategoryForm.sortOrder || 0}
                  onChange={(e) => setSubCategoryForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sub-category-active"
                checked={subCategoryForm.isActive !== false}
                onCheckedChange={(checked) => setSubCategoryForm(prev => ({ ...prev, isActive: checked as boolean }))}
              />
              <Label htmlFor="sub-category-active">Active</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSubCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubCategorySubmit}>
                <Save className="h-4 w-4 mr-2" />
                {isEditingSubCategory ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Paint Options Sub-Category Selection Modal */}
      <Dialog open={isPaintOptionsModalOpen} onOpenChange={setIsPaintOptionsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paint Options - Select Sub-Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Sub-Category</Label>
              <Select
                value={selectedPaintSubCategory}
                onValueChange={setSelectedPaintSubCategory}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sub-category" />
                </SelectTrigger>
                <SelectContent>
                  {subCategories
                    .filter(sc => sc.categoryId === 'paint_options')
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((subCategory) => (
                      <SelectItem key={subCategory.id} value={subCategory.id}>
                        {subCategory.displayName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Add Options section - shows when sub-category is selected */}
            {selectedPaintSubCategory && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex justify-between items-center">
                  <Label>Options</Label>
                  <Button variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Option
                  </Button>
                </div>

                {featureForm.options && featureForm.options.length > 0 && (
                  <div className="space-y-2">
                    {featureForm.options.map((option, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          placeholder="Value"
                          value={option.value}
                          onChange={(e) => updateOption(index, 'value', e.target.value)}
                        />
                        <Input
                          placeholder="Label"
                          value={option.label}
                          onChange={(e) => updateOption(index, 'label', e.target.value)}
                        />
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveOptionUp(index)}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveOptionDown(index)}
                            disabled={!featureForm.options || index === featureForm.options.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeOption(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsPaintOptionsModalOpen(false);
                  setSelectedPaintSubCategory('');
                  setFeatureForm(prev => ({ ...prev, options: [] }));
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  // Set the feature form with paint options category and create the feature
                  const featureData = {
                    ...featureForm,
                    category: 'paint_options',
                    type: 'dropdown' as const,
                    name: featureForm.name || selectedPaintSubCategory,
                    displayName: featureForm.displayName || subCategories.find(sc => sc.id === selectedPaintSubCategory)?.displayName || selectedPaintSubCategory
                  };
                  createFeatureMutation.mutate(featureData);
                  setIsPaintOptionsModalOpen(false);
                  setSelectedPaintSubCategory('');
                }}
                disabled={!selectedPaintSubCategory}
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p className="mb-4">Are you sure you want to delete this item? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}