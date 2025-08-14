import { useState, useRef, useCallback, useEffect } from 'react';
import { BrowserMultiFormatReader, Result } from '@zxing/library';

export interface CameraScannerState {
  isScanning: boolean;
  isInitializing: boolean;
  error: string | null;
  hasPermission: boolean;
}

export interface CameraScannerActions {
  startScanning: () => Promise<void>;
  stopScanning: () => void;
  requestPermission: () => Promise<boolean>;
}

export function useCameraScanner(
  onBarcodeDetected: (barcode: string) => void
): CameraScannerState & CameraScannerActions {
  const [state, setState] = useState<CameraScannerState>({
    isScanning: false,
    isInitializing: false,
    error: null,
    hasPermission: false,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize the barcode reader
  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader();
    
    return () => {
      stopScanning();
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isInitializing: true, error: null }));
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      // Test successful, stop the stream for now
      stream.getTracks().forEach(track => track.stop());
      
      setState(prev => ({ 
        ...prev, 
        hasPermission: true, 
        isInitializing: false 
      }));
      
      return true;
    } catch (error) {
      console.error('Camera permission denied:', error);
      setState(prev => ({ 
        ...prev, 
        hasPermission: false, 
        isInitializing: false,
        error: 'Camera permission denied. Please allow camera access to scan barcodes.'
      }));
      return false;
    }
  }, []);

  const startScanning = useCallback(async (): Promise<void> => {
    if (!readerRef.current || !videoRef.current) return;

    try {
      setState(prev => ({ ...prev, isInitializing: true, error: null }));

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;

      // Start decoding from video stream
      await readerRef.current.decodeFromVideoDevice(
        undefined, // Use default video device
        videoRef.current,
        (result: Result | null, error?: Error) => {
          if (result) {
            const barcodeText = result.getText();
            console.log('Barcode detected:', barcodeText);
            onBarcodeDetected(barcodeText);
            
            // Provide haptic feedback on mobile
            if ('vibrate' in navigator) {
              navigator.vibrate(100);
            }
          }
          
          if (error && !(error.name === 'NotFoundException')) {
            console.error('Barcode scanning error:', error);
          }
        }
      );

      setState(prev => ({ 
        ...prev, 
        isScanning: true, 
        isInitializing: false 
      }));

    } catch (error) {
      console.error('Failed to start camera scanning:', error);
      setState(prev => ({ 
        ...prev, 
        isScanning: false, 
        isInitializing: false,
        error: 'Failed to access camera. Please check camera permissions.'
      }));
    }
  }, [onBarcodeDetected]);

  const stopScanning = useCallback(() => {
    // Stop the barcode reader
    if (readerRef.current) {
      readerRef.current.reset();
    }

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setState(prev => ({ 
      ...prev, 
      isScanning: false, 
      isInitializing: false 
    }));
  }, []);

  // Expose video ref for the component to use
  const getVideoRef = useCallback(() => videoRef, []);

  return {
    ...state,
    startScanning,
    stopScanning,
    requestPermission,
    getVideoRef,
  } as CameraScannerState & CameraScannerActions & { getVideoRef: () => React.MutableRefObject<HTMLVideoElement | null> };
}