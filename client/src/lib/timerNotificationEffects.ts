let alertIntervalId: ReturnType<typeof setInterval> | null = null;

export function playAlertSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.5;
    
    oscillator.start();
    
    setTimeout(() => {
      oscillator.frequency.value = 1100;
    }, 200);
    setTimeout(() => {
      oscillator.frequency.value = 880;
    }, 400);
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 600);
  } catch (e) {
    console.error('Failed to play alert sound:', e);
  }
}

export function startLoopingAlert(stepName: string, showBrowserNotif: boolean = true): void {
  if (alertIntervalId) return;
  
  playAlertSound();
  
  if (showBrowserNotif) {
    showBrowserNotification(stepName);
  }
  
  alertIntervalId = setInterval(() => {
    playAlertSound();
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
