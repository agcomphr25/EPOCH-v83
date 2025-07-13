#!/bin/bash

echo "Setting up Capacitor for mobile deployment..."

# Install Capacitor CLI and core packages
npm install -g @capacitor/cli
npm install @capacitor/core @capacitor/app @capacitor/haptics @capacitor/keyboard @capacitor/status-bar @capacitor/push-notifications

# Install platform-specific packages
npm install @capacitor/android @capacitor/ios

# Initialize Capacitor (if not already done)
if [ ! -d "android" ] && [ ! -d "ios" ]; then
  echo "Initializing Capacitor..."
  npx cap init
fi

# Add platforms
echo "Adding Android platform..."
npx cap add android

echo "Adding iOS platform..."
npx cap add ios

# Build the web app
echo "Building web app..."
npm run build

# Sync with platforms
echo "Syncing with platforms..."
npx cap sync

echo "Capacitor setup complete!"
echo "To open in Android Studio: npx cap open android"
echo "To open in Xcode: npx cap open ios"