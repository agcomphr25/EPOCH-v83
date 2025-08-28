import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

export default function ScrapOrderModal({ order, onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    reason: '',
    disposition: '',
    authorization: '',
    scrapDate: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const scrapReasons = [
    'Material Defect',
    'Manufacturing Error',
    'Quality Control Failure',
    'Damage During Processing',
    'Tooling Issue',
    'Customer Change Request',
    'Design Error',
    'Other'
  ];

  const dispositionOptions = [
    'Discard',
    'Rework',
    'Return to Supplier',
    'Salvage Parts',
    'Engineering Review'
  ];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span>Scrap Order {order.orderId}</span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <strong>Warning:</strong> This action will mark the order as scrapped and remove it from the active pipeline.
          </div>

          <div>
            <Label htmlFor="reason">Scrap Reason *</Label>
            <Select
              value={formData.reason}
              onValueChange={(value) => handleInputChange('reason', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {scrapReasons.map(reason => (
                  <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="disposition">Disposition *</Label>
            <Select
              value={formData.disposition}
              onValueChange={(value) => handleInputChange('disposition', value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select disposition" />
              </SelectTrigger>
              <SelectContent>
                {dispositionOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="authorization">Authorization *</Label>
            <Input
              id="authorization"
              value={formData.authorization}
              onChange={(e) => handleInputChange('authorization', e.target.value)}
              placeholder="Enter authorizing person/department"
              required
            />
          </div>

          <div>
            <Label htmlFor="scrapDate">Scrap Date *</Label>
            <Input
              id="scrapDate"
              type="date"
              value={formData.scrapDate}
              onChange={(e) => handleInputChange('scrapDate', e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="destructive"
              disabled={!formData.reason || !formData.disposition || !formData.authorization}
            >
              Confirm Scrap
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}