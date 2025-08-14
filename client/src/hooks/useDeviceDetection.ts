import { useState, useEffect } from 'react';

export interface DeviceCapabilities {
  isMobile: boolean;
  hasCamera: boolean;
  hasTouchScreen: boolean;
  isStandalone: boolean; // PWA mode
}

export function useDeviceDetection(): DeviceCapabilities {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities>({
    isMobile: false,
    hasCamera: false,
    hasTouchScreen: false,
    isStandalone: false,
  });

  useEffect(() => {
    const detectCapabilities = async () => {
      // Detect mobile device
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth <= 768;

      // Detect touch screen
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      // Detect PWA standalone mode
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      // Detect camera capability
      let hasCamera = false;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          // Check if camera is available
          const devices = await navigator.mediaDevices.enumerateDevices();
          hasCamera = devices.some(device => device.kind === 'videoinput');
        }
      } catch (error) {
        console.log('Camera detection failed:', error);
        hasCamera = false;
      }

      setCapabilities({
        isMobile,
        hasCamera,
        hasTouchScreen,
        isStandalone,
      });
    };

    detectCapabilities();
  }, []);

  return capabilities;
}