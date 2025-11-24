import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Loader2, Save, RotateCcw, Settings, Type, Ruler, Palette } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface PDFSettings {
  id?: string;
  margins: {
    STANDARD: number;
    COMPACT: number;
    WIDE: number;
  };
  fontSizes: {
    TITLE_LARGE: number;
    TITLE_MEDIUM: number;
    TITLE_SMALL: number;
    SECTION_HEADER: number;
    BODY_LARGE: number;
    BODY_MEDIUM: number;
    BODY_SMALL: number;
    TINY: number;
  };
  lineHeights: {
    TITLE: number;
    SECTION: number;
    BODY: number;
    COMPACT: number;
    DENSE: number;
  };
  spacing: {
    SECTION_GAP_LARGE: number;
    SECTION_GAP_MEDIUM: number;
    SECTION_GAP_SMALL: number;
    SECTION_GAP_TINY: number;
    COLUMN_GAP: number;
    BOX_PADDING: number;
    BOX_PADDING_SMALL: number;
    LINE_SPACING_LARGE: number;
    LINE_SPACING_MEDIUM: number;
    LINE_SPACING_SMALL: number;
    LINE_SPACING_COMPACT: number;
  };
  colors: {
    TEXT_PRIMARY: { r: number; g: number; b: number };
    TEXT_SECONDARY: { r: number; g: number; b: number };
    TEXT_TERTIARY: { r: number; g: number; b: number };
    TEXT_LIGHT: { r: number; g: number; b: number };
    BG_TABLE_HEADER: { r: number; g: number; b: number };
    BG_WHITE: { r: number; g: number; b: number };
    BG_LIGHT_GRAY: { r: number; g: number; b: number };
    BORDER_BLACK: { r: number; g: number; b: number };
    BORDER_GRAY: { r: number; g: number; b: number };
    BORDER_LIGHT: { r: number; g: number; b: number };
    ACCENT_RED: { r: number; g: number; b: number };
    ACCENT_BLUE: { r: number; g: number; b: number };
    ACCENT_GREEN: { r: number; g: number; b: number };
  };
}

export default function PDFSettings() {
  const { toast } = useToast();
  const [localSettings, setLocalSettings] = useState<PDFSettings | null>(null);

  // Fetch current PDF settings
  const { data: settings, isLoading } = useQuery<PDFSettings>({
    queryKey: ['/api/pdf-settings'],
  });

  // Initialize local settings when data loads
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: PDFSettings) => {
      return apiRequest('/api/pdf-settings', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-settings'] });
      toast({
        title: 'Settings saved',
        description: 'PDF configuration has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    },
  });

  // Reset settings mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/pdf-settings/reset', {
        method: 'POST',
      });
    },
    onSuccess: (data) => {
      setLocalSettings(data);
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-settings'] });
      toast({
        title: 'Settings reset',
        description: 'PDF configuration has been reset to defaults.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to reset settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    },
  });

  const handleSave = () => {
    if (localSettings) {
      saveMutation.mutate(localSettings);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all PDF settings to defaults? This action cannot be undone.')) {
      resetMutation.mutate();
    }
  };

  const updateMargin = (key: keyof PDFSettings['margins'], value: number) => {
    if (localSettings) {
      setLocalSettings({
        ...localSettings,
        margins: { ...localSettings.margins, [key]: value },
      });
    }
  };

  const updateFontSize = (key: keyof PDFSettings['fontSizes'], value: number) => {
    if (localSettings) {
      setLocalSettings({
        ...localSettings,
        fontSizes: { ...localSettings.fontSizes, [key]: value },
      });
    }
  };

  const updateLineHeight = (key: keyof PDFSettings['lineHeights'], value: number) => {
    if (localSettings) {
      setLocalSettings({
        ...localSettings,
        lineHeights: { ...localSettings.lineHeights, [key]: value },
      });
    }
  };

  const updateSpacing = (key: keyof PDFSettings['spacing'], value: number) => {
    if (localSettings) {
      setLocalSettings({
        ...localSettings,
        spacing: { ...localSettings.spacing, [key]: value },
      });
    }
  };

  const updateColor = (colorKey: keyof PDFSettings['colors'], channel: 'r' | 'g' | 'b', value: number) => {
    if (localSettings) {
      setLocalSettings({
        ...localSettings,
        colors: {
          ...localSettings.colors,
          [colorKey]: {
            ...localSettings.colors[colorKey],
            [channel]: value,
          },
        },
      });
    }
  };

  if (isLoading || !localSettings) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl" data-testid="page-pdf-settings">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            PDF Configuration Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Control margins, fonts, spacing, and colors for all PDF documents
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={resetMutation.isPending}
            data-testid="button-reset-settings"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="margins" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="margins" data-testid="tab-margins">
            <Ruler className="h-4 w-4 mr-2" />
            Margins
          </TabsTrigger>
          <TabsTrigger value="typography" data-testid="tab-typography">
            <Type className="h-4 w-4 mr-2" />
            Typography
          </TabsTrigger>
          <TabsTrigger value="spacing" data-testid="tab-spacing">
            <Settings className="h-4 w-4 mr-2" />
            Spacing
          </TabsTrigger>
          <TabsTrigger value="colors" data-testid="tab-colors">
            <Palette className="h-4 w-4 mr-2" />
            Colors
          </TabsTrigger>
        </TabsList>

        {/* Margins Tab */}
        <TabsContent value="margins">
          <Card>
            <CardHeader>
              <CardTitle>Page Margins</CardTitle>
              <CardDescription>Control the page margins for PDF documents (in points)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(localSettings.margins).map(([key, value]) => (
                <div key={key} className="flex items-center gap-4">
                  <Label className="w-32">{key}</Label>
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => updateMargin(key as keyof PDFSettings['margins'], Number(e.target.value))}
                    className="w-32"
                    data-testid={`input-margin-${key.toLowerCase()}`}
                  />
                  <span className="text-sm text-muted-foreground">points</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Typography Tab */}
        <TabsContent value="typography">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Font Sizes</CardTitle>
                <CardDescription>Control font sizes for different text elements (in points)</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {Object.entries(localSettings.fontSizes).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-4">
                    <Label className="w-48">{key}</Label>
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => updateFontSize(key as keyof PDFSettings['fontSizes'], Number(e.target.value))}
                      className="w-24"
                      data-testid={`input-fontsize-${key.toLowerCase()}`}
                    />
                    <span className="text-sm text-muted-foreground">pt</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Line Heights</CardTitle>
                <CardDescription>Control line heights for different text elements (in points)</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {Object.entries(localSettings.lineHeights).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-4">
                    <Label className="w-48">{key}</Label>
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => updateLineHeight(key as keyof PDFSettings['lineHeights'], Number(e.target.value))}
                      className="w-24"
                      data-testid={`input-lineheight-${key.toLowerCase()}`}
                    />
                    <span className="text-sm text-muted-foreground">pt</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Spacing Tab */}
        <TabsContent value="spacing">
          <Card>
            <CardHeader>
              <CardTitle>Spacing & Padding</CardTitle>
              <CardDescription>Control spacing between elements and padding (in points)</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {Object.entries(localSettings.spacing).map(([key, value]) => (
                <div key={key} className="flex items-center gap-4">
                  <Label className="w-56">{key}</Label>
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => updateSpacing(key as keyof PDFSettings['spacing'], Number(e.target.value))}
                    className="w-24"
                    data-testid={`input-spacing-${key.toLowerCase()}`}
                  />
                  <span className="text-sm text-muted-foreground">pt</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Colors Tab */}
        <TabsContent value="colors">
          <Card>
            <CardHeader>
              <CardTitle>Color Palette</CardTitle>
              <CardDescription>
                Control colors for text, backgrounds, and borders (RGB values: 0-1)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.entries(localSettings.colors).map(([colorKey, colorValue]) => (
                <div key={colorKey} className="space-y-2">
                  <Label className="font-semibold">{colorKey}</Label>
                  <div className="flex items-center gap-4 pl-4">
                    <div className="flex items-center gap-2">
                      <Label className="w-6">R</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={colorValue.r}
                        onChange={(e) => updateColor(
                          colorKey as keyof PDFSettings['colors'],
                          'r',
                          Number(e.target.value)
                        )}
                        className="w-20"
                        data-testid={`input-color-${colorKey.toLowerCase()}-r`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="w-6">G</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={colorValue.g}
                        onChange={(e) => updateColor(
                          colorKey as keyof PDFSettings['colors'],
                          'g',
                          Number(e.target.value)
                        )}
                        className="w-20"
                        data-testid={`input-color-${colorKey.toLowerCase()}-g`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="w-6">B</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={colorValue.b}
                        onChange={(e) => updateColor(
                          colorKey as keyof PDFSettings['colors'],
                          'b',
                          Number(e.target.value)
                        )}
                        className="w-20"
                        data-testid={`input-color-${colorKey.toLowerCase()}-b`}
                      />
                    </div>
                    <div
                      className="w-16 h-8 border rounded"
                      style={{
                        backgroundColor: `rgb(${Math.round(colorValue.r * 255)}, ${Math.round(colorValue.g * 255)}, ${Math.round(colorValue.b * 255)})`,
                      }}
                    />
                  </div>
                  <Separator />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
