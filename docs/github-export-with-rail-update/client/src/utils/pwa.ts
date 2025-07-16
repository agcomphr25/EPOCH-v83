/**
 * PWA utilities for service worker registration and app installation
 */

// Register service worker
export const registerServiceWorker = async (): Promise<void> => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered: ', registration);
    } catch (registrationError) {
      console.log('SW registration failed: ', registrationError);
    }
  }
};

// Check if app can be installed
export const canInstallApp = (): boolean => {
  return 'serviceWorker' in navigator && 'standalone' in window.navigator;
};

// Install app prompt
let deferredPrompt: any;

export const setupInstallPrompt = (): void => {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
  });
};

export const showInstallPrompt = async (): Promise<boolean> => {
  if (deferredPrompt) {
    // Show the prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    // Optionally, send analytics event with outcome of user choice
    console.log(`User response to the install prompt: ${outcome}`);
    // We've used the prompt, and can't use it again, throw it away
    deferredPrompt = null;
    return outcome === 'accepted';
  }
  return false;
};

// Check if app is installed
export const isAppInstalled = (): boolean => {
  return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
};

// Check if running on mobile device
export const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};