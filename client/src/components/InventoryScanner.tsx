import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import useScanner from '../hooks/useScanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';
import type { Employee } from '@shared/schema';

export default function InventoryScanner() {
  const scannedCode = useScanner();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    itemCode: '',
    expirationDate: '',
    manufactureDate: '',
    lotNumber: '',
    batchNumber: '',
    technicianId: '',
  });

  // Load technicians
  const { data: technicians = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees', 'Receiving'],
    queryFn: () => apiRequest('/api/employees?role=Receiving'),
  });

  // Auto-fill code on scan
  useEffect(() => {
    if (scannedCode) {
      setFormData(fd => ({ ...fd, itemCode: scannedCode }));
      toast.success(`Scanned: ${scannedCode}`);
    }
  }, [scannedCode]);

  const scanMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest('/api/inventory/scan', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      toast.success('Scan recorded ✔️');
      setFormData({
        itemCode: '',
        expirationDate: '',
        manufactureDate: '',
        lotNumber: '',
        batchNumber: '',
        technicianId: '',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/scans'] });
    },
    onError: () => toast.error('Error recording scan ❗'),
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData(fd => ({ ...fd, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.itemCode) {
      toast.error('Item code is required');
      return;
    }
    scanMutation.mutate(formData);
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Inventory Scanner</CardTitle>
        <p className="text-sm text-gray-600">
          Press Ctrl+S to simulate scanning a barcode
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="itemCode">Scanned Code</Label>
            <Input
              id="itemCode"
              name="itemCode"
              value={formData.itemCode}
              onChange={handleChange}
              className="bg-gray-50"
              placeholder="Scan or enter item code"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expirationDate">Expiration Date</Label>
              <Input
                id="expirationDate"
                name="expirationDate"
                type="date"
                value={formData.expirationDate}
                onChange={handleChange}
              />
            </div>
            <div>
              <Label htmlFor="manufactureDate">Manufacture Date</Label>
              <Input
                id="manufactureDate"
                name="manufactureDate"
                type="date"
                value={formData.manufactureDate}
                onChange={handleChange}
              />
            </div>
            <div>
              <Label htmlFor="lotNumber">Lot Number</Label>
              <Input
                id="lotNumber"
                name="lotNumber"
                value={formData.lotNumber}
                onChange={handleChange}
                placeholder="Enter lot number"
              />
            </div>
            <div>
              <Label htmlFor="batchNumber">Batch Number</Label>
              <Input
                id="batchNumber"
                name="batchNumber"
                value={formData.batchNumber}
                onChange={handleChange}
                placeholder="Enter batch number"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="technicianId">Technician</Label>
            <Select value={formData.technicianId} onValueChange={(value) => 
              setFormData(fd => ({ ...fd, technicianId: value }))
            }>
              <SelectTrigger>
                <SelectValue placeholder="Select Technician" />
              </SelectTrigger>
              <SelectContent>
                {technicians.map(t => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            type="submit" 
            className="w-full"
            disabled={scanMutation.isPending}
          >
            {scanMutation.isPending ? 'Recording...' : 'Record Scan'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}