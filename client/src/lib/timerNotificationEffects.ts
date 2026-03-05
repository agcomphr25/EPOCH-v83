let alertIntervalId: ReturnType<typeof setInterval> | null = null;

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

export function triggerVibration(): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 300]);
    }
  } catch (e) {
    // Vibration API not supported or blocked
  }
}

export function startLoopingAlert(stepName: string, showBrowserNotif: boolean = true, volume: number = 0.8, vibrationEnabled: boolean = true): void {
  if (alertIntervalId) return;
  
  playAlertSound(volume);
  if (vibrationEnabled) triggerVibration();
  
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
