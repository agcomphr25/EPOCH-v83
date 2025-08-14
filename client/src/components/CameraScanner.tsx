import { useRef, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Zap, AlertCircle } from 'lucide-react';
import { useCameraScanner } from '@/hooks/useCameraScanner';

interface CameraScannerProps {
  onBarcodeDetected: (barcode: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function CameraScanner({ onBarcodeDetected, isOpen, onClose }: CameraScannerProps) {
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  const {
    isScanning,
    isInitializing,
    error,
    hasPermission,
    startScanning,
    stopScanning,
    requestPermission,
    getVideoRef
  } = useCameraScanner((barcode) => {
    onBarcodeDetected(barcode);
    onClose(); // Auto-close after successful scan
  });

  const videoRef = getVideoRef();

  // Append video element to container when scanning starts
  useEffect(() => {
    if (isScanning && videoRef.current && videoContainerRef.current) {
      videoContainerRef.current.appendChild(videoRef.current);
    }
    
    return () => {
      if (videoRef.current && videoRef.current.parentNode) {
        videoRef.current.parentNode.removeChild(videoRef.current);
      }
    };
  }, [isScanning, videoRef]);

  // Create video element with proper styling
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.style.width = '100%';
      videoRef.current.style.height = '100%';
      videoRef.current.style.objectFit = 'cover';
      videoRef.current.playsInline = true;
      videoRef.current.muted = true;
    }
  }, [videoRef]);

  const handleStartScanning = async () => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }
    
    await startScanning();
  };

  const handleStopScanning = () => {
    stopScanning();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
      <div className="w-full h-full max-w-2xl max-h-[80vh] relative">
        <Card className="h-full">
          <CardContent className="p-0 h-full relative">
            {!isScanning && !isInitializing && (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Camera className="h-16 w-16 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Camera Barcode Scanner</h3>
                <p className="text-gray-600 mb-6">
                  Point your camera at a barcode to scan it automatically
                </p>
                
                {error && (
                  <div className="flex items-center gap-2 text-red-600 mb-4 p-3 bg-red-50 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{error}</span>
                  </div>
                )}
                
                <div className="flex gap-3">
                  <Button onClick={handleStartScanning} disabled={isInitializing}>
                    <Camera className="h-4 w-4 mr-2" />
                    {isInitializing ? 'Initializing...' : 'Start Camera'}
                  </Button>
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {isInitializing && (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600">Initializing camera...</p>
              </div>
            )}

            {isScanning && (
              <>
                {/* Video container */}
                <div 
                  ref={videoContainerRef}
                  className="w-full h-full bg-black rounded-lg overflow-hidden"
                />
                
                {/* Scanning overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Scanning frame */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="w-64 h-48 border-2 border-white rounded-lg relative">
                      {/* Corner indicators */}
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-400"></div>
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400"></div>
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-400"></div>
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-400"></div>
                      
                      {/* Scanning line animation */}
                      <div className="absolute top-0 left-0 w-full h-0.5 bg-green-400 animate-pulse"></div>
                    </div>
                  </div>
                  
                  {/* Instructions */}
                  <div className="absolute bottom-20 left-0 right-0 text-center">
                    <div className="bg-black/70 text-white px-4 py-2 rounded-lg mx-4">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Zap className="h-4 w-4" />
                        <span className="font-medium">Position barcode in frame</span>
                      </div>
                      <p className="text-xs text-gray-300">
                        Hold steady for automatic detection
                      </p>
                    </div>
                  </div>
                </div>

                {/* Control buttons */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3">
                  <Button 
                    variant="destructive" 
                    onClick={handleStopScanning}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <CameraOff className="h-4 w-4 mr-2" />
                    Stop Camera
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}