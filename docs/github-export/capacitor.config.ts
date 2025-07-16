import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.epoch.manufacturing.erp',
  appName: 'EPOCH v8',
  webDir: 'dist/public',
  bundledWebRuntime: false,
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      spinnerColor: '#1d4ed8'
    },
    StatusBar: {
      style: 'DARK'
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  }
};

export default config;