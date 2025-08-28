import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Camera, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

interface DiagnosticResult {
  test: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  message: string;
  details?: any;
}

export function MobileCameraDiagnostic() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (test: string, status: DiagnosticResult['status'], message: string, details?: any) => {
    setResults(prev => [...prev, { test, status, message, details }]);
  };

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);

    try {
      // Device Detection
      const userAgent = navigator.userAgent;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isIOS = /iPad|iPhone|iPod/.test(userAgent);
      const isAndroid = /Android/.test(userAgent);
      
      addResult('Device Detection', 'info', `Device Type: ${isMobile ? 'Mobile' : 'Desktop'}`, {
        userAgent,
        isMobile,
        isIOS,
        isAndroid
      });

      // Media Devices API Support
      if (!navigator.mediaDevices) {
        addResult('Media Devices API', 'fail', 'navigator.mediaDevices not available - HTTPS required');
        return;
      }
      addResult('Media Devices API', 'pass', 'MediaDevices API available');

      // Enumerate devices
      let devices = [];
      try {
        devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        addResult('Camera Detection', videoDevices.length > 0 ? 'pass' : 'fail', 
          `Found ${videoDevices.length} camera(s)`, 
          videoDevices.map(d => ({ label: d.label, deviceId: d.deviceId }))
        );
      } catch (error) {
        addResult('Camera Detection', 'fail', `Failed to enumerate devices: ${error.message}`);
      }

      // Test basic camera access
      try {
        const basicStream = await navigator.mediaDevices.getUserMedia({ video: true });
        addResult('Basic Camera Access', 'pass', 'Camera permission granted');
        
        const tracks = basicStream.getTracks();
        addResult('Camera Stream', 'pass', `Stream active with ${tracks.length} track(s)`, 
          tracks.map(t => ({
            kind: t.kind,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState,
            settings: t.getSettings ? t.getSettings() : null
          }))
        );
        
        // Stop the test stream
        tracks.forEach(track => track.stop());
      } catch (error) {
        addResult('Basic Camera Access', 'fail', `Camera access denied: ${error.message}`);
        return;
      }

      // Test mobile-specific constraints
      if (isMobile) {
        try {
          const mobileStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 30, max: 60 }
            }
          });
          
          addResult('Mobile Camera Constraints', 'pass', 'Mobile-optimized constraints work');
          
          const videoTrack = mobileStream.getVideoTracks()[0];
          if (videoTrack) {
            const settings = videoTrack.getSettings();
            addResult('Camera Settings', 'info', 'Applied camera settings', settings);
          }
          
          mobileStream.getTracks().forEach(track => track.stop());
        } catch (error) {
          addResult('Mobile Camera Constraints', 'warning', `Mobile constraints failed: ${error.message}`);
          
          // Fallback test
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment' }
            });
            addResult('Fallback Camera', 'pass', 'Fallback constraints work');
            fallbackStream.getTracks().forEach(track => track.stop());
          } catch (fallbackError) {
            addResult('Fallback Camera', 'fail', `All camera access failed: ${fallbackError.message}`);
          }
        }
      }

      // Test video element creation
      try {
        const video = document.createElement('video');
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        
        addResult('Video Element', 'pass', 'Video element created successfully', {
          playsInline: video.playsInline,
          muted: video.muted,
          autoplay: video.autoplay
        });
      } catch (error) {
        addResult('Video Element', 'fail', `Video element creation failed: ${error.message}`);
      }

      // Browser-specific checks
      const browserInfo = {
        isChrome: /Chrome/.test(userAgent),
        isFirefox: /Firefox/.test(userAgent),
        isSafari: /Safari/.test(userAgent) && !/Chrome/.test(userAgent),
        isEdge: /Edge/.test(userAgent)
      };
      
      addResult('Browser Info', 'info', 'Browser details', browserInfo);

      // Security context
      addResult('Security Context', window.isSecureContext ? 'pass' : 'fail', 
        window.isSecureContext ? 'Secure context (HTTPS)' : 'Insecure context - camera may not work'
      );

    } catch (error) {
      addResult('Diagnostic Error', 'fail', `Unexpected error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'pass': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'fail': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'info': return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const getStatusColor = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'pass': return 'bg-green-50 border-green-200';
      case 'fail': return 'bg-red-50 border-red-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'info': return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Mobile Camera Diagnostic Tool
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={runDiagnostics} 
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              <Camera className="h-4 w-4" />
              {isRunning ? 'Running Diagnostics...' : 'Run Camera Diagnostics'}
            </Button>
            
            {results.length > 0 && (
              <Button 
                variant="outline" 
                onClick={() => setResults([])}
              >
                Clear Results
              </Button>
            )}
          </div>

          {isRunning && (
            <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-blue-700">Running camera diagnostics...</span>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-lg">Diagnostic Results</h3>
              
              {results.map((result, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded-lg border ${getStatusColor(result.status)}`}
                >
                  <div className="flex items-start gap-3">
                    {getStatusIcon(result.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{result.test}</span>
                        <Badge variant="outline" className="text-xs">
                          {result.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700">{result.message}</p>
                      
                      {result.details && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                            View Details
                          </summary>
                          <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Summary */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Summary</h4>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">
                    ✓ {results.filter(r => r.status === 'pass').length} Passed
                  </span>
                  <span className="text-red-600">
                    ✗ {results.filter(r => r.status === 'fail').length} Failed
                  </span>
                  <span className="text-yellow-600">
                    ⚠ {results.filter(r => r.status === 'warning').length} Warnings
                  </span>
                  <span className="text-blue-600">
                    ℹ {results.filter(r => r.status === 'info').length} Info
                  </span>
                </div>
                
                {results.some(r => r.status === 'fail') && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                    <p className="text-sm text-red-700 font-medium mb-2">
                      Camera issues detected. Try these solutions:
                    </p>
                    <ul className="text-xs text-red-600 list-disc list-inside space-y-1">
                      <li>Ensure you're using HTTPS (required for camera access)</li>
                      <li>Check browser permissions: Settings → Privacy → Camera</li>
                      <li>Close other apps that might be using the camera</li>
                      <li>Try refreshing the page</li>
                      <li>Try a different browser (Chrome/Firefox work best)</li>
                      <li>On iOS: Use Safari browser for best compatibility</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}