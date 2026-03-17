import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Check, X } from 'lucide-react';

interface ActionItem {
  item: string;
  owner: string;
  status: 'open' | 'in_progress' | 'complete' | 'deferred';
  dueDate: string;
}

interface Props {
  session: any;
  onSave: (fields: any) => void;
  saving: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  complete: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  deferred: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  complete: 'Complete',
  deferred: 'Deferred',
};

export default function ActionItemsSlide({ session, onSave, saving }: Props) {
  const [editing, setEditing] = useState(false);
  const items: ActionItem[] = session?.action_items ?? [];
  const [draft, setDraft] = useState<ActionItem[]>(items);
  const [newItem, setNewItem] = useState<ActionItem>({ item: '', owner: '', status: 'open', dueDate: '' });

  function addItem() {
    if (!newItem.item.trim()) return;
    setDraft([...draft, { ...newItem }]);
    setNewItem({ item: '', owner: '', status: 'open', dueDate: '' });
  }

  function removeItem(i: number) {
    setDraft(draft.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, field: keyof ActionItem, value: string) {
    setDraft(draft.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  }

  function handleSave() {
    onSave({ action_items: draft });
    setEditing(false);
  }

  function handleCancel() {
    setDraft(items);
    setEditing(false);
  }

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Action Items Update</h2>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => { setDraft(items); setEditing(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </div>
      <div className="h-1 w-16 bg-blue-500 rounded mb-4" />

      {!editing ? (
        <div className="flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 italic">
              No action items. Click Edit to add.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                  <th className="text-left py-2 px-3 font-semibold">Item</th>
                  <th className="text-left py-2 px-3 font-semibold">Owner</th>
                  <th className="text-left py-2 px-3 font-semibold">Status</th>
                  <th className="text-left py-2 px-3 font-semibold">Due</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ai, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-3 px-3 text-gray-900 dark:text-white">{ai.item}</td>
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-300">{ai.owner}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ai.status] ?? ''}`}>
                        {STATUS_LABELS[ai.status] ?? ai.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-500 text-sm">{ai.dueDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3 overflow-auto">
          <div className="flex-1 overflow-auto space-y-2">
            {draft.map((ai, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={ai.item} onChange={(e) => updateItem(i, 'item', e.target.value)} placeholder="Action item" className="flex-1" />
                <Input value={ai.owner} onChange={(e) => updateItem(i, 'owner', e.target.value)} placeholder="Owner" className="w-32" />
                <Select value={ai.status} onValueChange={(v) => updateItem(i, 'status', v)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="deferred">Deferred</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={ai.dueDate} onChange={(e) => updateItem(i, 'dueDate', e.target.value)} placeholder="Due date" className="w-28" />
                <Button size="icon" variant="ghost" onClick={() => removeItem(i)}>
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-center border-t pt-3">
            <Input value={newItem.item} onChange={(e) => setNewItem({ ...newItem, item: e.target.value })} placeholder="New item" className="flex-1" />
            <Input value={newItem.owner} onChange={(e) => setNewItem({ ...newItem, owner: e.target.value })} placeholder="Owner" className="w-32" />
            <Select value={newItem.status} onValueChange={(v) => setNewItem({ ...newItem, status: v as any })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="deferred">Deferred</SelectItem>
              </SelectContent>
            </Select>
            <Input value={newItem.dueDate} onChange={(e) => setNewItem({ ...newItem, dueDate: e.target.value })} placeholder="Due date" className="w-28" />
            <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}><Check className="h-4 w-4 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}><X className="h-4 w-4 mr-1" /> Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
