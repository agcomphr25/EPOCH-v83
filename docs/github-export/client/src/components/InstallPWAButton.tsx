import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Smartphone, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showInstallPrompt, isAppInstalled, isMobileDevice } from '@/utils/pwa';

interface InstallPWAButtonProps {
  className?: string;
}

export default function InstallPWAButton({ className }: InstallPWAButtonProps) {
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    setIsInstalled(isAppInstalled());
    
    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setCanInstall(true);
      
      // Show install banner for mobile devices
      if (isMobileDevice() && !isAppInstalled()) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    const success = await showInstallPrompt();
    if (success) {
      setShowInstallBanner(false);
      setCanInstall(false);
      setIsInstalled(true);
    }
  };

  const handleDismissBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa-banner-dismissed', 'true');
  };

  // Don't show anything if app is already installed
  if (isInstalled) {
    return null;
  }

  // Install banner for mobile devices
  if (showInstallBanner && isMobileDevice()) {
    return (
      <Card className="fixed bottom-4 left-4 right-4 z-50 shadow-lg border-primary">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Install EPOCH v8</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissBanner}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Get the full app experience! Install EPOCH v8 on your device for offline access and better performance.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2">
            <Button onClick={handleInstallClick} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Install App
            </Button>
            <Button variant="outline" onClick={handleDismissBanner}>
              Not Now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Install button for desktop/when banner is not shown
  if (canInstall) {
    return (
      <Button
        onClick={handleInstallClick}
        variant="outline"
        size="sm"
        className={className}
      >
        <Download className="h-4 w-4 mr-2" />
        Install App
      </Button>
    );
  }

  return null;
}