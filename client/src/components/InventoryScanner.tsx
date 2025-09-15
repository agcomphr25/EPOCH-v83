import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import useScanner from '../hooks/useScanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Scan } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Employee } from '@shared/schema';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { useBarcodeInput } from '@/hooks/useBarcodeInput';
import { CameraScanner } from '@/components/CameraScanner';

export default function InventoryScanner() {
  const scannedCode = useScanner();
  const queryClient = useQueryClient();
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  
  // Device detection for smart UI
  const { isMobile, hasCamera } = useDeviceDetection();
  
  // Unified barcode input handling
  const {
    barcode,
    scannedBarcode,
    isValidBarcode,
    handleBarcodeDetected,
    clearScan
  } = useBarcodeInput();
  
  const [formData, setFormData] = useState({
    itemCode: '',
    quantity: '1',
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

  // Auto-fill code on scan or redirect to order scanner for P1 barcodes
  useEffect(() => {
    if (scannedCode) {
      handleBarcodeDetected(scannedCode);
    }
  }, [scannedCode, handleBarcodeDetected]);

  // Handle barcode detection from camera or unified input
  useEffect(() => {
    if (scannedBarcode) {
      // Check if this is a P1 order barcode
      if (scannedBarcode.startsWith('P1-')) {
        toast.success(`P1 Order barcode detected: ${scannedBarcode}`);
        toast('Redirecting to Order Scanner...', { icon: '🔄' });
        // Redirect to barcode scanner page with the scanned code
        setTimeout(() => {
          window.location.href = `/barcode-scanner?scan=${encodeURIComponent(scannedBarcode)}`;
        }, 1000);
      } else {
        // Regular inventory item
        setFormData(fd => ({ ...fd, itemCode: scannedBarcode }));
        toast.success(`Inventory item scanned: ${scannedBarcode}`);
      }
    }
  }, [scannedBarcode]);

  const handleCameraScan = (detectedBarcode: string) => {
    handleBarcodeDetected(detectedBarcode);
    setShowCameraScanner(false);
  };

  const scanMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/inventory/scan', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      toast.success('Scan recorded ✔️');
      setFormData({
        itemCode: '',
        quantity: '1',
        expirationDate: '',
        manufactureDate: '',
        lotNumber: '',
        batchNumber: '',
        technicianId: '',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/scans'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
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
    
    const submitData = {
      ...formData,
      quantity: parseInt(formData.quantity) || 1
    };
    
    scanMutation.mutate(submitData);
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          Inventory In Scanner
        </CardTitle>
        <p className="text-sm text-gray-600">
          {hasCamera && isMobile 
            ? 'Scan barcodes with your camera or enter manually' 
            : 'Press Ctrl+S to simulate scanning a barcode'}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="itemCode">Scanned Code</Label>
              <div className="space-y-2">
                <Input
                  id="itemCode"
                  name="itemCode"
                  value={formData.itemCode}
                  onChange={handleChange}
                  className="bg-gray-50"
                  placeholder="Scan or enter item code"
                />
                
                {/* Camera scanning option */}
                {hasCamera && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCameraScanner(true)}
                    className="w-full"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {isMobile ? 'Scan with Camera' : 'Use Camera Scanner'}
                  </Button>
                )}
              </div>
            </div>
            
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={handleChange}
                placeholder="Enter quantity"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={handleChange}
                placeholder="Enter quantity"
              />
            </div>
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
      
      {/* Camera Scanner Modal */}
      <CameraScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onBarcodeDetected={handleCameraScan}
      />
    </Card>
  );
}