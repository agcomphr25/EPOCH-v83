let alertIntervalId: ReturnType<typeof setInterval> | null = null;
let vibrationKeepAliveId: ReturnType<typeof setInterval> | null = null;

export function playAlertSound(volume: number = 0.8): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    const clampedVolume = Math.max(0, Math.min(1, volume));
    oscillator.frequency.value = 880;
    oscillator.type = 'square';
    gainNode.gain.value = clampedVolume;
    
    oscillator.start();
    
    setTimeout(() => {
      oscillator.frequency.value = 1100;
    }, 150);
    setTimeout(() => {
      oscillator.frequency.value = 880;
    }, 300);
    setTimeout(() => {
      oscillator.frequency.value = 1100;
    }, 450);
    setTimeout(() => {
      oscillator.frequency.value = 880;
    }, 600);
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 800);
  } catch (e) {
    console.error('Failed to play alert sound:', e);
  }
}

function playHapticAudioPulse(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 20;
    oscillator.type = 'sine';
    gainNode.gain.value = 1.0;

    oscillator.start();

    gainNode.gain.setValueAtTime(1.0, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 200);
  } catch (e) {
    // Haptic audio fallback not available
  }
}

const vibrateSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function';

export function triggerVibration(): void {
  if (vibrateSupported) {
    try {
      navigator.vibrate([300, 100, 300, 100, 400]);
    } catch (e) {
      // Vibration blocked by browser
    }
  } else {
    playHapticAudioPulse();
  }
}

export function primeVibration(): void {
  if (vibrateSupported) {
    try {
      navigator.vibrate(1);
    } catch (e) {
      // ignore
    }
  }
}

function startVibrationKeepAlive(): void {
  if (vibrationKeepAliveId) return;
  if (!vibrateSupported) return;
  vibrationKeepAliveId = setInterval(() => {
    try {
      navigator.vibrate(1);
    } catch (e) {
      // ignore
    }
  }, 2000);
}

function stopVibrationKeepAlive(): void {
  if (vibrationKeepAliveId) {
    clearInterval(vibrationKeepAliveId);
    vibrationKeepAliveId = null;
  }
  if (vibrateSupported) {
    try {
      navigator.vibrate(0);
    } catch (e) {
      // ignore
    }
  }
}

export function startLoopingAlert(stepName: string, showBrowserNotif: boolean = true, volume: number = 0.8, vibrationEnabled: boolean = true): void {
  if (alertIntervalId) return;
  
  playAlertSound(volume);
  if (vibrationEnabled) {
    triggerVibration();
    startVibrationKeepAlive();
  }
  
  if (showBrowserNotif) {
    showBrowserNotification(stepName);
  }
  
  alertIntervalId = setInterval(() => {
    playAlertSound(volume);
    if (vibrationEnabled) triggerVibration();
  }, 4000);
}

export function stopLoopingAlert(): void {
  if (alertIntervalId) {
    clearInterval(alertIntervalId);
    alertIntervalId = null;
  }
  stopVibrationKeepAlive();
}

export function isLoopingAlertActive(): boolean {
  return alertIntervalId !== null;
}

export function showBrowserNotification(stepName: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Step Time Complete!', {
      body: `${stepName} - Press Next Step to continue`,
      icon: '/favicon.ico',
      requireInteraction: true,
    });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification('Step Time Complete!', {
          body: `${stepName} - Press Next Step to continue`,
          icon: '/favicon.ico',
          requireInteraction: true,
        });
      }
    });
  }
}
