import { useState, useEffect } from 'react';
import { sendFocusNotification } from './notificationService';
import type { CVAlert } from './cvService';

/**
 * useDistractionMonitor
 *
 * Tracks distraction events (tab blur, simulated background noise) and
 * fires a browser notification whenever the user leaves the Productifi tab.
 *
 * The notification is delivered via the standard Notification API, so it appears
 * on whichever tab or app the user has switched to — not just inside Productifi.
 *
 * @param isActive         - Whether the session is currently running (not paused)
 * @param mode             - Focus rule: 'Strict mode' | 'Balanced mode' | 'Monitor only'
 * @param sessionType      - e.g. 'Deep Study', 'General Work', etc.
 * @param minutesRemaining - Minutes left in the planned session (shown in notification body)
 */
export function useDistractionMonitor(
  isActive: boolean,
  mode: string,
  sessionType: string = '',
  minutesRemaining: number = 0,
) {
  const [distractions, setDistractions] = useState<number>(0);
  const [blockedAlerts, setBlockedAlerts] = useState<CVAlert[]>([]);

  const isStrict = mode === 'Strict mode' || sessionType === 'Deep Study';

  useEffect(() => {
    if (!isActive) return;

    const handleBlur = () => {
      // User switched to another tab or window.
      setDistractions(d => d + 1);

      const sites = ['YouTube', 'Twitter/X', 'Reddit', 'Instagram'];
      const site = sites[Math.floor(Math.random() * sites.length)];

      let msg = '';
      if (isStrict) {
        msg = `Blocked attempt to visit ${site} or leave session!`;
      } else if (mode === 'Balanced mode') {
        msg = `Warning: You left the session (perhaps to ${site}).`;
      } else {
        msg = `Logged attention loss event.`;
      }

      setBlockedAlerts(prev => [{ msg, ts: Date.now() }, ...prev].slice(0, 5));

      // Fire a browser notification so the nudge reaches the user on their active tab.
      // sendFocusNotification respects the cooldown — it silently skips if called too soon.
      sendFocusNotification(minutesRemaining);
    };

    // Listen for the real window blur event (user leaves the tab/window)
    window.addEventListener('blur', handleBlur);

    // Simulate occasional background noise to keep the demo lively.
    // ~5% chance every 12 seconds — does not trigger a browser notification.
    const demoInterval = setInterval(() => {
      if (Math.random() > 0.95) {
        setDistractions(d => d + 1);
        const sites = ['Discord', 'Slack', 'Email'];
        const site = sites[Math.floor(Math.random() * sites.length)];
        const msg = isStrict
          ? `Blocked background notification from ${site}`
          : `Notification from ${site} logged`;
        setBlockedAlerts(prev => [{ msg, ts: Date.now() }, ...prev].slice(0, 5));
      }
    }, 12000);

    return () => {
      window.removeEventListener('blur', handleBlur);
      clearInterval(demoInterval);
    };
  }, [isActive, mode, sessionType, isStrict, minutesRemaining]);

  return { distractions, blockedAlerts };
}
