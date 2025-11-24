import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Scan } from 'lucide-react';
import { useCameraScanner } from '@/hooks/useCameraScanner';

interface BarcodeInputFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'data-testid'?: string;
  disabled?: boolean;
}

export function BarcodeInputField({
  id,
  value,
  onChange,
  placeholder,
  'data-testid': testId,
  disabled,
}: BarcodeInputFieldProps) {
  const [showScanner, setShowScanner] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const handleBarcodeDetected = (barcode: string) => {
    onChange(barcode);
    setShowScanner(false);
  };

  const scanner = useCameraScanner(handleBarcodeDetected) as any;
  const {
    isScanning,
    isInitializing,
    error,
    startScanning,
    stopScanning,
    getVideoRef,
  } = scanner;

  useEffect(() => {
    if (showScanner && videoContainerRef.current) {
      const videoRef = getVideoRef();
      if (videoRef.current && !videoContainerRef.current.contains(videoRef.current)) {
        videoContainerRef.current.appendChild(videoRef.current);
        videoRef.current.style.width = '100%';
        videoRef.current.style.height = 'auto';
        videoRef.current.style.borderRadius = '8px';
      }
      startScanning();
    }

    return () => {
      if (!showScanner) {
        stopScanning();
      }
    };
  }, [showScanner, startScanning, stopScanning, getVideoRef]);

  const handleOpenScanner = () => {
    setShowScanner(true);
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
    stopScanning();
  };

  // Handle hardware barcode scanner input (listens for rapid keystrokes)
  useEffect(() => {
    let barcodeBuffer = '';
    let timeoutId: NodeJS.Timeout;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Only process if this specific input is focused
      if (document.activeElement !== inputRef.current) {
        return;
      }

      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Handle Enter key (end of barcode scan)
      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 0) {
          onChange(barcodeBuffer);
          barcodeBuffer = '';
        }
        return;
      }

      // Accumulate characters for hardware scanner
      if (e.key.length === 1) {
        barcodeBuffer += e.key;

        // Auto-submit after 100ms of no input (typical for barcode scanners)
        timeoutId = setTimeout(() => {
          if (barcodeBuffer.length > 3) {
            onChange(barcodeBuffer);
          }
          barcodeBuffer = '';
        }, 100);
      }
    };

    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener('keypress', handleKeyPress as any);
    }

    return () => {
      if (inputElement) {
        inputElement.removeEventListener('keypress', handleKeyPress as any);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [onChange]);

  return (
    <>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleOpenScanner}
          disabled={disabled}
          data-testid={`${testId}-scan-button`}
          title="Scan barcode with camera"
        >
          <Scan className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={showScanner} onOpenChange={handleCloseScanner}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              ref={videoContainerRef}
              className="relative bg-black rounded-lg overflow-hidden"
              style={{ minHeight: '300px' }}
            >
              {isInitializing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                    <p>Initializing camera...</p>
                  </div>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-600 p-4">
                  <div className="text-center">
                    <p className="font-medium">Camera Error</p>
                    <p className="text-sm mt-2">{error}</p>
                  </div>
                </div>
              )}
              {isScanning && !error && (
                <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                  Scanning...
                </div>
              )}
            </div>
            <div className="text-sm text-gray-600 text-center">
              Position the barcode within the camera view
            </div>
            <Button
              variant="outline"
              onClick={handleCloseScanner}
              className="w-full"
              data-testid="button-close-scanner"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
