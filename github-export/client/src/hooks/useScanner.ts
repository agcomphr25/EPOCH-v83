import { useEffect, useState } from 'react';

// Mock scanner hook for now - in production would integrate with actual scanner SDK
export default function useScanner() {
  const [scannedData, setScannedData] = useState('');

  useEffect(() => {
    // Mock scanner initialization
    // In production, this would be:
    // ScannerSDK.initialize({
    //   onData: data => setScannedData(data),
    //   onError: err => console.error('Scanner error:', err),
    // });

    // For demo purposes, we'll simulate scanning with keyboard events
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        // Simulate scanning a barcode (mix of inventory parts and P1 orders)
        const mockBarcodes = ['PART001', 'PART002', 'PART003', 'P1-AG185', 'P1-AN001', 'P1-AP001'];
        const randomBarcode = mockBarcodes[Math.floor(Math.random() * mockBarcodes.length)];
        setScannedData(randomBarcode);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      // In production: ScannerSDK.disconnect();
    };
  }, []);

  return scannedData;
}