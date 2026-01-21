import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NormalizedFieldDef } from './FieldOverlay';
import { Trash2 } from 'lucide-react';

interface FieldInspectorPanelProps {
  field: NormalizedFieldDef | null;
  pageWidth: number;
  pageHeight: number;
  onUpdate: (updates: Partial<NormalizedFieldDef>) => void;
  onDelete: () => void;
}

export default function FieldInspectorPanel({
  field,
  pageWidth,
  pageHeight,
  onUpdate,
  onDelete,
}: FieldInspectorPanelProps) {
  if (!field) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select a field to edit its properties
        </CardContent>
      </Card>
    );
  }

  const x = Math.round(field.normalizedX * pageWidth);
  const y = Math.round(field.normalizedY * pageHeight);
  const width = Math.round(field.normalizedWidth * pageWidth);
  const height = Math.round(field.normalizedHeight * pageHeight);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Field Properties</CardTitle>
          <Badge variant="secondary">{field.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fieldName">Field Key</Label>
          <Input
            id="fieldName"
            value={field.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="field_name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fieldLabel">Display Label</Label>
          <Input
            id="fieldLabel"
            value={field.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Display Label"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="required"
            checked={field.required || false}
            onCheckedChange={(checked) => onUpdate({ required: checked })}
          />
          <Label htmlFor="required">Required</Label>
        </div>

        <div className="pt-2 border-t">
          <Label className="text-sm font-medium mb-2 block">Position & Size</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="posX" className="text-xs text-muted-foreground">X</Label>
              <Input
                id="posX"
                type="number"
                value={x}
                onChange={(e) => {
                  const newX = parseInt(e.target.value) || 0;
                  onUpdate({ normalizedX: newX / pageWidth });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="posY" className="text-xs text-muted-foreground">Y</Label>
              <Input
                id="posY"
                type="number"
                value={y}
                onChange={(e) => {
                  const newY = parseInt(e.target.value) || 0;
                  onUpdate({ normalizedY: newY / pageHeight });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="width" className="text-xs text-muted-foreground">Width</Label>
              <Input
                id="width"
                type="number"
                value={width}
                onChange={(e) => {
                  const newWidth = parseInt(e.target.value) || 50;
                  onUpdate({ normalizedWidth: newWidth / pageWidth });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="height" className="text-xs text-muted-foreground">Height</Label>
              <Input
                id="height"
                type="number"
                value={height}
                onChange={(e) => {
                  const newHeight = parseInt(e.target.value) || 20;
                  onUpdate({ normalizedHeight: newHeight / pageHeight });
                }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Page</Label>
          <Input
            type="number"
            value={field.page + 1}
            onChange={(e) => {
              const newPage = Math.max(0, (parseInt(e.target.value) || 1) - 1);
              onUpdate({ page: newPage });
            }}
            min={1}
          />
        </div>

        <div className="pt-4 border-t">
          <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Field
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
