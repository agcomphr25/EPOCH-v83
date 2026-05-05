import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FlaskConical, Variable, Tag, X } from 'lucide-react';

const CATEGORIES = [
  { value: 'small', label: 'Small' },
  { value: 'feature', label: 'Feature' },
  { value: 'large_architecture', label: 'Large Architecture' },
  { value: 'audit', label: 'Audit' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'skill_builder', label: 'Skill Builder' },
] as const;

type CategoryValue = typeof CATEGORIES[number]['value'];

type VariableDef = {
  name: string;
  label: string;
  defaultValue: string;
  required: boolean;
  sortOrder: number;
};

type ProteusPromptPayload = {
  title: string;
  category: CategoryValue;
  description: string;
  body: string;
  variables: VariableDef[];
  tags: string[];
};

type ExistingPrompt = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  body: string;
  variables: Array<{
    name: string;
    label: string;
    defaultValue: string | null;
    required: boolean | null;
    sortOrder: number | null;
  }>;
  tags: string[];
};

function extractTokens(body: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const found = new Set<string>();
  let match;
  while ((match = regex.exec(body)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

export default function ProteusPromptBuilder() {
  const [, setLocation] = useLocation();
  const [matchNew] = useRoute('/prompt-library/new');
  const [matchEdit, editParams] = useRoute('/prompt-library/:id/edit');
  const { toast } = useToast();

  const isEdit = !!matchEdit && !matchNew;
  const promptId = isEdit ? editParams?.id : null;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryValue | ''>('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [variables, setVariables] = useState<VariableDef[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const { data: existing, isLoading: existingLoading } = useQuery<ExistingPrompt>({
    queryKey: ['/api/proteus-labs/prompts', promptId],
    queryFn: async () => {
      const res = await fetch(`/api/proteus-labs/prompts/${promptId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load prompt');
      return res.json();
    },
    enabled: isEdit && !!promptId,
  });

  useEffect(() => {
    if (existing) {
      setTitle(existing.title ?? '');
      setCategory((existing.category as CategoryValue) ?? '');
      setDescription(existing.description ?? '');
      setBody(existing.body ?? '');
      setVariables(
        (existing.variables ?? []).map((v, idx) => ({
          name: v.name,
          label: v.label,
          defaultValue: v.defaultValue ?? '',
          required: v.required !== false,
          sortOrder: v.sortOrder ?? idx,
        }))
      );
      setTags(existing.tags ?? []);
    }
  }, [existing]);

  useEffect(() => {
    const tokens = extractTokens(body);
    setVariables((prev) => {
      const existingNames = new Set(prev.map((v) => v.name));
      const newVars: VariableDef[] = tokens
        .filter((t) => !existingNames.has(t))
        .map((t, idx) => ({
          name: t,
          label: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          defaultValue: '',
          required: true,
          sortOrder: prev.length + idx,
        }));
      const filtered = prev.filter((v) => tokens.includes(v.name));
      return [...filtered, ...newVars];
    });
  }, [body]);

  const createMutation = useMutation({
    mutationFn: async (data: ProteusPromptPayload) => {
      const res = await fetch('/api/proteus-labs/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Failed to create prompt');
      }
      return res.json() as Promise<{ id: string; title: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/prompts'] });
      toast({ title: 'Prompt created', description: data.title });
      setLocation(`/prompt-library/${data.id}`);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProteusPromptPayload) => {
      const res = await fetch(`/api/proteus-labs/prompts/${promptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Failed to update prompt');
      }
      return res.json() as Promise<{ id: string; title: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/prompts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/prompts', promptId] });
      toast({ title: 'Prompt updated', description: data.title });
      setLocation(`/prompt-library/${promptId}`);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    if (!category) {
      toast({ title: 'Category required', variant: 'destructive' });
      return;
    }
    if (!body.trim()) {
      toast({ title: 'Prompt body required', variant: 'destructive' });
      return;
    }

    const payload: ProteusPromptPayload = { title, category, description, body, variables, tags };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const updateVariable = (idx: number, field: keyof VariableDef, value: string | boolean | number) => {
    setVariables((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && existingLoading) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            isEdit ? setLocation(`/prompt-library/${promptId}`) : setLocation('/prompt-library')
          }
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Edit Prompt' : 'New Prompt'}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="space-y-1">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Build a new module from scratch"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Category *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as CategoryValue)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Short summary shown in the library card..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="body">Prompt Body *</Label>
            <p className="text-xs text-gray-500">
              Use <code className="bg-gray-100 px-1 rounded">{'{{variable_name}}'}</code> tokens for dynamic fields.
            </p>
            <Textarea
              id="body"
              placeholder="You are an expert software engineer. Build {{module_name}} that does {{description}}..."
              className="min-h-[250px] font-mono text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                <Tag className="h-4 w-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Variable className="h-4 w-4 text-indigo-600" />
                Variables ({variables.length})
              </CardTitle>
              <p className="text-xs text-gray-500">
                Auto-detected from <code className="bg-gray-100 px-1 rounded">{'{{tokens}}'}</code> in the body.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {variables.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No variables detected yet. Add <code>{'{{token}}'}</code> to the prompt body.
                </p>
              ) : (
                variables.map((v, idx) => (
                  <div key={v.name} className="space-y-2 p-3 bg-gray-50 rounded-md">
                    <code className="text-xs font-semibold text-indigo-700">{`{{${v.name}}}`}</code>
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input
                        className="h-7 text-xs"
                        value={v.label}
                        onChange={(e) => updateVariable(idx, 'label', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Default Value</Label>
                      <Input
                        className="h-7 text-xs"
                        placeholder="Optional default..."
                        value={v.defaultValue}
                        onChange={(e) => updateVariable(idx, 'defaultValue', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`req-${idx}`}
                        checked={v.required}
                        onChange={(e) => updateVariable(idx, 'required', e.target.checked)}
                        className="h-3 w-3"
                      />
                      <label htmlFor={`req-${idx}`} className="text-xs text-gray-600">Required</label>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Button className="w-full" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Prompt'}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              isEdit ? setLocation(`/prompt-library/${promptId}`) : setLocation('/prompt-library')
            }
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
