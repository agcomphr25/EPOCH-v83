import { useState, useCallback, useEffect } from 'react';

export interface BarcodeInputState {
  barcode: string;
  scannedBarcode: string | null;
  isValidBarcode: boolean;
  barcodeType: 'P1_ORDER' | 'P2_ORDER' | 'INVENTORY' | 'UNKNOWN' | null;
}

export interface BarcodeInputActions {
  setBarcode: (barcode: string) => void;
  handleScan: () => void;
  handleBarcodeDetected: (barcode: string) => void;
  clearScan: () => void;
}

// Barcode validation patterns
const BARCODE_PATTERNS = {
  P1_ORDER: /^P1-[A-Z]{2}\d+$/i,
  P2_ORDER: /^P2-[A-Z]{2}\d+$/i,
  INVENTORY: /^(PART|INV)-\w+$/i,
} as const;

function validateBarcode(barcode: string): { 
  isValid: boolean; 
  type: BarcodeInputState['barcodeType'] 
} {
  if (!barcode.trim()) {
    return { isValid: false, type: null };
  }

  for (const [type, pattern] of Object.entries(BARCODE_PATTERNS)) {
    if (pattern.test(barcode)) {
      return { 
        isValid: true, 
        type: type as BarcodeInputState['barcodeType'] 
      };
    }
  }

  // Accept any alphanumeric barcode as potentially valid
  const generalPattern = /^[A-Z0-9\-_]+$/i;
  if (generalPattern.test(barcode)) {
    return { isValid: true, type: 'UNKNOWN' };
  }

  return { isValid: false, type: null };
}

export function useBarcodeInput(): BarcodeInputState & BarcodeInputActions {
  const [barcode, setBarcode] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);

  const validation = validateBarcode(barcode);

  const handleScan = useCallback(() => {
    if (barcode.trim() && validation.isValid) {
      setScannedBarcode(barcode.trim().toUpperCase());
    }
  }, [barcode, validation.isValid]);

  const handleBarcodeDetected = useCallback((detectedBarcode: string) => {
    const cleanBarcode = detectedBarcode.trim().toUpperCase();
    setBarcode(cleanBarcode);
    
    const detectedValidation = validateBarcode(cleanBarcode);
    if (detectedValidation.isValid) {
      setScannedBarcode(cleanBarcode);
    }
  }, []);

  const clearScan = useCallback(() => {
    setScannedBarcode(null);
    setBarcode('');
  }, []);

  // Handle keyboard input for traditional barcode scanners
  useEffect(() => {
    let barcodeBuffer = '';
    let timeoutId: NodeJS.Timeout;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Only process if no input is focused (traditional scanner behavior)
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Handle Enter key (end of barcode scan)
      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 0) {
          handleBarcodeDetected(barcodeBuffer);
          barcodeBuffer = '';
        }
        return;
      }

      // Accumulate characters
      if (e.key.length === 1) {
        barcodeBuffer += e.key;
        
        // Auto-submit after 100ms of no input (typical for barcode scanners)
        timeoutId = setTimeout(() => {
          if (barcodeBuffer.length > 3) { // Minimum barcode length
            handleBarcodeDetected(barcodeBuffer);
          }
          barcodeBuffer = '';
        }, 100);
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [handleBarcodeDetected]);

  return {
    barcode,
    scannedBarcode,
    isValidBarcode: validation.isValid,
    barcodeType: validation.type,
    setBarcode,
    handleScan,
    handleBarcodeDetected,
    clearScan,
  };
}