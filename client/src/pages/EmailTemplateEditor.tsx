import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link as LinkIcon, Undo, Redo,
  Eye, Send, Save, History, FileText, Code, ChevronLeft,
  Table as TableIcon, RotateCcw, Clock, User, MessageSquare,
  Loader2, CheckCircle, AlertCircle, Variable
} from 'lucide-react';

interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  allowedVariables: string[];
  attachmentRules: Record<string, unknown>;
  version: number;
  currentVersion: number;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  createdAt: string | null;
  createdBy: string | null;
  changeNote: string | null;
}

function EditorToolbar({ editor }: { editor: any }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/30">
      <Button
        type="button"
        variant={editor.isActive('bold') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className="h-8 w-8 p-0"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('italic') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className="h-8 w-8 p-0"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('underline') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className="h-8 w-8 p-0"
      >
        <UnderlineIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('strike') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className="h-8 w-8 p-0"
      >
        <Strikethrough className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-8 mx-1" />

      <Button
        type="button"
        variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className="h-8 w-8 p-0"
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className="h-8 w-8 p-0"
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className="h-8 w-8 p-0"
      >
        <AlignRight className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-8 mx-1" />

      <Button
        type="button"
        variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className="h-8 w-8 p-0"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className="h-8 w-8 p-0"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-8 mx-1" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const url = window.prompt('Enter URL');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        className="h-8 w-8 p-0"
      >
        <LinkIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        className="h-8 w-8 p-0"
      >
        <TableIcon className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-8 mx-1" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="h-8 w-8 p-0"
      >
        <Undo className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="h-8 w-8 p-0"
      >
        <Redo className="h-4 w-4" />
      </Button>
    </div>
  );
}

function VersionHistoryPanel({
  templateKey,
  onRestore,
}: {
  templateKey: string;
  onRestore: (version: TemplateVersion) => void;
}) {
  const [viewVersion, setViewVersion] = useState<TemplateVersion | null>(null);

  const { data: versions = [], isLoading } = useQuery<TemplateVersion[]>({
    queryKey: ['/api/email-templates', templateKey, 'versions'],
    queryFn: () => fetch(`/api/email-templates/${templateKey}/versions`).then(r => r.json()),
    enabled: !!templateKey,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No version history yet</p>
        <p className="text-sm">Versions are created when templates are edited</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[500px]">
        <div className="space-y-2 p-2">
          {versions.map((v) => (
            <Card key={v.id} className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline">v{v.version}</Badge>
                <span className="text-xs text-muted-foreground">
                  {v.createdAt ? new Date(v.createdAt).toLocaleString() : 'Unknown'}
                </span>
              </div>
              {v.createdBy && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <User className="h-3 w-3" />
                  <span>User {v.createdBy}</span>
                </div>
              )}
              {v.changeNote && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                  <MessageSquare className="h-3 w-3" />
                  <span>{v.changeNote}</span>
                </div>
              )}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewVersion(v)}
                  className="h-7 text-xs"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRestore(v)}
                  className="h-7 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restore
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={!!viewVersion} onOpenChange={() => setViewVersion(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version {viewVersion?.version} - {viewVersion?.subject}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <div
              className="p-4 bg-white rounded border"
              dangerouslySetInnerHTML={{ __html: viewVersion?.bodyHtml || '' }}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function EmailTemplateEditor() {
  const { toast } = useToast();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('editor');
  const [editorMode, setEditorMode] = useState<'wysiwyg' | 'html'>('wysiwyg');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [allowedVariables, setAllowedVariables] = useState<string[]>([]);
  const [attachmentRulesJson, setAttachmentRulesJson] = useState('{}');
  const [changeNote, setChangeNote] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [htmlSource, setHtmlSource] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ['/api/email-templates'],
  });

  const { data: selectedTemplate, isLoading: templateLoading } = useQuery<EmailTemplate>({
    queryKey: ['/api/email-templates', selectedKey],
    queryFn: () => fetch(`/api/email-templates/${selectedKey}`).then(r => r.json()),
    enabled: !!selectedKey,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setIsDirty(true);
      setBodyHtml(editor.getHTML());
    },
  });

  useEffect(() => {
    if (selectedTemplate && editor) {
      setSubject(selectedTemplate.subject);
      setBodyHtml(selectedTemplate.bodyHtml);
      setBodyText(selectedTemplate.bodyText || '');
      setAllowedVariables(selectedTemplate.allowedVariables || []);
      setAttachmentRulesJson(JSON.stringify(selectedTemplate.attachmentRules || {}, null, 2));
      setHtmlSource(selectedTemplate.bodyHtml);
      setChangeNote('');
      setIsDirty(false);

      if (editorMode === 'wysiwyg') {
        editor.commands.setContent(selectedTemplate.bodyHtml);
      }
    }
  }, [selectedTemplate, editor]);

  const switchToWysiwyg = useCallback(() => {
    if (editor) {
      editor.commands.setContent(htmlSource || bodyHtml);
      setBodyHtml(editor.getHTML());
    }
    setEditorMode('wysiwyg');
  }, [editor, htmlSource, bodyHtml]);

  const switchToHtml = useCallback(() => {
    if (editor) {
      setHtmlSource(editor.getHTML());
    }
    setEditorMode('html');
  }, [editor]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const finalHtml = editorMode === 'html' ? htmlSource : bodyHtml;
      let parsedAttachmentRules = {};
      try {
        parsedAttachmentRules = JSON.parse(attachmentRulesJson);
      } catch {
        throw new Error('Invalid JSON in attachment rules');
      }

      return apiRequest('PUT', `/api/email-templates/${selectedKey}`, {
        subject,
        bodyHtml: finalHtml,
        bodyText: bodyText || null,
        allowedVariables,
        attachmentRules: parsedAttachmentRules,
        changeNote,
      });
    },
    onSuccess: () => {
      toast({ title: 'Template saved', description: `Version updated successfully.` });
      setIsDirty(false);
      setChangeNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates', selectedKey] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates', selectedKey, 'versions'] });
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: err.message || 'Failed to save template', variant: 'destructive' });
    },
  });

  const testSendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/email-templates/${selectedKey}/test-send`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Test email sent', description: `Sent to ${data.sentTo}` });
    },
    onError: (err: any) => {
      toast({ title: 'Test send failed', description: err.message || 'Failed to send test email', variant: 'destructive' });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/email-templates/${selectedKey}/preview`);
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewHtml(data.html);
      setShowPreview(true);
    },
    onError: (err: any) => {
      toast({ title: 'Preview failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleRestore = useCallback(
    (version: TemplateVersion) => {
      if (!version.bodyHtml || !version.subject) {
        toast({ title: 'Cannot restore', description: 'Version data is incomplete', variant: 'destructive' });
        return;
      }

      setSubject(version.subject);
      setBodyHtml(version.bodyHtml);
      setBodyText(version.bodyText || '');
      setHtmlSource(version.bodyHtml);
      setChangeNote(`Restored from version ${version.version}`);
      setIsDirty(true);

      if (editor && editorMode === 'wysiwyg') {
        editor.commands.setContent(version.bodyHtml);
      }

      toast({
        title: 'Version loaded',
        description: `Version ${version.version} loaded into editor. Save to create a new version.`,
      });
    },
    [editor, editorMode, toast]
  );

  const insertVariable = useCallback(
    (variable: string) => {
      if (editorMode === 'wysiwyg' && editor) {
        editor.chain().focus().insertContent(`{{${variable}}}`).run();
      } else {
        setHtmlSource((prev) => prev + `{{${variable}}}`);
      }
      setIsDirty(true);
    },
    [editor, editorMode]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Panel - Template List */}
      <div className="w-72 border-r bg-muted/20 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Email Templates
          </h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {templatesLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    if (isDirty && selectedKey !== t.key) {
                      if (!window.confirm('You have unsaved changes. Switch templates?')) return;
                    }
                    setSelectedKey(t.key);
                    setActiveTab('editor');
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedKey === t.key
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="text-xs opacity-70 truncate">{t.key}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={t.isActive ? 'default' : 'secondary'} className="text-xs h-5">
                      {t.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-xs opacity-60">v{t.currentVersion}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedKey ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg">Select a template to edit</p>
              <p className="text-sm">Choose from the template list on the left</p>
            </div>
          </div>
        ) : templateLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-semibold text-lg">{selectedTemplate?.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedTemplate?.key} - Version {selectedTemplate?.currentVersion}
                  {selectedTemplate?.updatedAt && (
                    <span> - Last updated {new Date(selectedTemplate.updatedAt).toLocaleDateString()}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending}
                >
                  {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testSendMutation.mutate()}
                  disabled={testSendMutation.isPending}
                >
                  {testSendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Test Send
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !changeNote.trim() || !isDirty}
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-4 mt-2 w-fit">
                <TabsTrigger value="editor">
                  <Code className="h-4 w-4 mr-1" />
                  Editor
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History className="h-4 w-4 mr-1" />
                  Version History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="flex-1 overflow-auto p-4 mt-0">
                <div className="grid grid-cols-[1fr_280px] gap-4 h-full">
                  {/* Main Editor Area */}
                  <div className="space-y-4 overflow-auto">
                    {/* Subject */}
                    <div>
                      <Label htmlFor="subject">Subject</Label>
                      <Input
                        id="subject"
                        value={subject}
                        onChange={(e) => {
                          setSubject(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="Email subject line..."
                      />
                    </div>

                    {/* HTML Editor */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>HTML Body</Label>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant={editorMode === 'wysiwyg' ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={switchToWysiwyg}
                          >
                            Visual
                          </Button>
                          <Button
                            type="button"
                            variant={editorMode === 'html' ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={switchToHtml}
                          >
                            HTML Source
                          </Button>
                        </div>
                      </div>

                      {editorMode === 'wysiwyg' ? (
                        <div className="border rounded-md overflow-hidden">
                          <EditorToolbar editor={editor} />
                          <div className="p-3 min-h-[300px] prose prose-sm max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_td]:border [&_.ProseMirror_td]:p-2 [&_.ProseMirror_th]:border [&_.ProseMirror_th]:p-2 [&_.ProseMirror_th]:bg-muted">
                            <EditorContent editor={editor} />
                          </div>
                        </div>
                      ) : (
                        <Textarea
                          value={htmlSource}
                          onChange={(e) => {
                            setHtmlSource(e.target.value);
                            setBodyHtml(e.target.value);
                            setIsDirty(true);
                          }}
                          className="font-mono text-xs min-h-[340px]"
                          placeholder="Enter raw HTML..."
                        />
                      )}
                    </div>

                    {/* Plain Text Fallback */}
                    <div>
                      <Label htmlFor="bodyText">Plain Text Fallback</Label>
                      <Textarea
                        id="bodyText"
                        value={bodyText}
                        onChange={(e) => {
                          setBodyText(e.target.value);
                          setIsDirty(true);
                        }}
                        className="min-h-[120px] font-mono text-xs"
                        placeholder="Plain text version for email clients that don't support HTML..."
                      />
                    </div>

                    {/* Attachment Rules JSON */}
                    <div>
                      <Label htmlFor="attachmentRules">Attachment Rules (JSON)</Label>
                      <Textarea
                        id="attachmentRules"
                        value={attachmentRulesJson}
                        onChange={(e) => {
                          setAttachmentRulesJson(e.target.value);
                          setIsDirty(true);
                        }}
                        className="min-h-[80px] font-mono text-xs"
                        placeholder="{}"
                      />
                    </div>

                    {/* Change Note */}
                    <div>
                      <Label htmlFor="changeNote" className="flex items-center gap-1">
                        Change Note
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="changeNote"
                        value={changeNote}
                        onChange={(e) => setChangeNote(e.target.value)}
                        placeholder="Describe what you changed..."
                      />
                      {isDirty && !changeNote.trim() && (
                        <p className="text-xs text-destructive mt-1">A change note is required to save</p>
                      )}
                    </div>
                  </div>

                  {/* Right Sidebar - Variables */}
                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-1">
                          <Variable className="h-4 w-4" />
                          Template Variables
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {allowedVariables.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No variables defined</p>
                        ) : (
                          <div className="space-y-1">
                            {allowedVariables.map((v) => (
                              <button
                                key={v}
                                onClick={() => insertVariable(v)}
                                className="w-full text-left px-2 py-1.5 rounded text-xs font-mono hover:bg-muted transition-colors border border-transparent hover:border-border"
                                title="Click to insert"
                              >
                                {'{{' + v + '}}'}
                              </button>
                            ))}
                          </div>
                        )}
                        <Separator className="my-3" />
                        <div>
                          <Label className="text-xs">Edit Variables</Label>
                          <Textarea
                            value={allowedVariables.join('\n')}
                            onChange={(e) => {
                              setAllowedVariables(e.target.value.split('\n').filter(Boolean));
                              setIsDirty(true);
                            }}
                            className="min-h-[80px] font-mono text-xs mt-1"
                            placeholder="One variable per line..."
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm">Template Info</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Key</span>
                          <span className="font-mono">{selectedTemplate?.key}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Version</span>
                          <span>{selectedTemplate?.currentVersion}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status</span>
                          <Badge variant={selectedTemplate?.isActive ? 'default' : 'secondary'} className="text-xs h-5">
                            {selectedTemplate?.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        {selectedTemplate?.updatedAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Updated</span>
                            <span>{new Date(selectedTemplate.updatedAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-auto p-4 mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Version History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedKey && (
                      <VersionHistoryPanel
                        templateKey={selectedKey}
                        onRestore={handleRestore}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[70vh]">
            <div
              className="bg-white rounded border p-4"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
