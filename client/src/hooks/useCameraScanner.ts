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

  // Initialize the barcode reader and video element
  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader();
    
    // Create video element if it doesn't exist
    if (!videoRef.current) {
      videoRef.current = document.createElement('video');
      videoRef.current.playsInline = true;
      videoRef.current.muted = true;
      videoRef.current.autoplay = true;
      
      // Mobile-specific video attributes
      videoRef.current.setAttribute('webkit-playsinline', 'true');
      videoRef.current.setAttribute('playsinline', 'true');
      
      console.log('📱 Mobile Camera Debug: Video element created with mobile-friendly attributes');
    }
    
    return () => {
      stopScanning();
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isInitializing: true, error: null }));
      console.log('📱 Mobile Camera Debug: Requesting camera permission...');
      
      // Detect mobile device for optimized constraints
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      console.log('📱 Mobile Camera Debug: Is mobile device:', isMobile);
      
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' }, // Prefer back camera but fallback to front
          width: isMobile ? { ideal: 1280, max: 1920 } : { ideal: 1280 },
          height: isMobile ? { ideal: 720, max: 1080 } : { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          // Mobile-specific constraints
          ...(isMobile && {
            aspectRatio: { ideal: 16/9 },
            resizeMode: 'crop-and-scale'
          })
        }
      };
      
      console.log('📱 Mobile Camera Debug: Using constraints:', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('📱 Mobile Camera Debug: Permission granted successfully');
      console.log('📱 Mobile Camera Debug: Stream tracks:', stream.getTracks().map(t => ({ 
        kind: t.kind, 
        label: t.label, 
        enabled: t.enabled,
        readyState: t.readyState 
      })));
      
      // Test successful, stop the stream for now
      stream.getTracks().forEach(track => {
        console.log('📱 Mobile Camera Debug: Stopping test track:', track.label);
        track.stop();
      });
      
      setState(prev => ({ 
        ...prev, 
        hasPermission: true, 
        isInitializing: false 
      }));
      
      console.log('📱 Mobile Camera Debug: Permission state updated successfully');
      return true;
    } catch (error) {
      console.error('📱 Mobile Camera Debug: Permission failed:', error);
      console.error('📱 Mobile Camera Debug: Error details:', {
        name: error.name,
        message: error.message,
        constraint: error.constraint
      });
      
      setState(prev => ({ 
        ...prev, 
        hasPermission: false, 
        isInitializing: false,
        error: `Camera access failed: ${error.message}. Please check permissions in browser settings.`
      }));
      return false;
    }
  }, []);

  const startScanning = useCallback(async (): Promise<void> => {
    if (!readerRef.current || !videoRef.current) {
      console.error('📱 Mobile Camera Debug: Missing readerRef or videoRef');
      setState(prev => ({ ...prev, error: 'Camera initialization failed - missing components' }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isInitializing: true, error: null }));
      console.log('📱 Mobile Camera Debug: Starting camera scanning...');

      // Detect mobile device for optimized constraints
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' }, // Prefer back camera but fallback to front
          width: isMobile ? { ideal: 1280, max: 1920 } : { ideal: 1280 },
          height: isMobile ? { ideal: 720, max: 1080 } : { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          // Mobile-specific constraints
          ...(isMobile && {
            aspectRatio: { ideal: 16/9 },
            resizeMode: 'crop-and-scale'
          })
        }
      };
      
      console.log('📱 Mobile Camera Debug: Requesting camera stream with constraints:', constraints);

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('📱 Mobile Camera Debug: Camera stream obtained successfully');
      console.log('📱 Mobile Camera Debug: Stream details:', {
        id: stream.id,
        active: stream.active,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled,
          readyState: t.readyState,
          settings: t.getSettings ? t.getSettings() : 'N/A'
        }))
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;

      // Wait for video to load and be ready
      await new Promise<void>((resolve, reject) => {
        const video = videoRef.current!;
        
        const onLoadedMetadata = () => {
          console.log('📱 Mobile Camera Debug: Video metadata loaded:', {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState
          });
          
          // Try to play the video
          video.play().then(() => {
            console.log('📱 Mobile Camera Debug: Video playing successfully');
            resolve();
          }).catch(playError => {
            console.error('📱 Mobile Camera Debug: Video play failed:', playError);
            reject(playError);
          });
        };

        const onError = (e: Event) => {
          console.error('📱 Mobile Camera Debug: Video loading error:', e);
          reject(new Error('Video loading failed'));
        };

        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
        video.addEventListener('error', onError, { once: true });
        
        // Timeout fallback
        setTimeout(() => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          reject(new Error('Video loading timeout'));
        }, 5000);
      });

      console.log('📱 Mobile Camera Debug: Starting barcode decoding...');

      // Start decoding from video stream
      await readerRef.current.decodeFromVideoDevice(
        undefined, // Use default video device
        videoRef.current,
        (result: Result | null, error?: Error) => {
          if (result) {
            const barcodeText = result.getText();
            console.log('📱 Mobile Camera Debug: Barcode detected:', barcodeText);
            onBarcodeDetected(barcodeText);
            
            // Provide haptic feedback on mobile
            if ('vibrate' in navigator) {
              navigator.vibrate(100);
            }
          }
          
          if (error && !(error.name === 'NotFoundException')) {
            console.error('📱 Mobile Camera Debug: Barcode scanning error:', error);
          }
        }
      );

      setState(prev => ({ 
        ...prev, 
        isScanning: true, 
        isInitializing: false 
      }));

      console.log('📱 Mobile Camera Debug: Camera scanning started successfully');

    } catch (error) {
      console.error('📱 Mobile Camera Debug: Failed to start camera scanning:', error);
      console.error('📱 Mobile Camera Debug: Error details:', {
        name: error.name,
        message: error.message,
        constraint: error.constraint
      });
      
      setState(prev => ({ 
        ...prev, 
        isScanning: false, 
        isInitializing: false,
        error: `Failed to start camera: ${error.message}. Try refreshing the page.`
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