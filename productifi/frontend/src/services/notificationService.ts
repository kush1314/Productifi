/**
 * notificationService.ts
 *
 * Delivers OS-level focus nudges in two ways:
 *
 *  1. Service Worker  (preferred) — shows a persistent OS notification even
 *     when the browser window is minimised or on another monitor. Uses the
 *     registered /sw.js worker.
 *
 *  2. Notification API fallback — plain `new Notification()` for browsers
 *     that haven't registered the SW yet.
 *
 * Cooldowns (per tag) prevent spam while still being responsive:
 *   distraction / focus   45 s
 *   talking               30 s
 *   no-face               20 s
 */

const COOLDOWNS: Record<string, number> = {
  'productifi-focus':    40_000,
  'productifi-talking':  15_000,  // short — must fire reliably after every 3 s burst
  'productifi-noface':   18_000,
  'productifi-coaching': 60_000,
};

const lastFiredAt: Record<string, number> = {};

// ── Permission ──────────────────────────────────────────────────────────────

/**
 * Request notification permission during a user gesture.
 * Call this from a button's onClick handler for maximum browser compatibility.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function isOnCooldown(tag: string): boolean {
  const cooldown = COOLDOWNS[tag] ?? 45_000;
  return Date.now() - (lastFiredAt[tag] ?? 0) < cooldown;
}

function markFired(tag: string) {
  lastFiredAt[tag] = Date.now();
}

/** Post a message to the service worker so it shows an OS notification. */
async function sendViaSW(title: string, body: string, tag: string): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    // showNotification via SW is the most reliable path on macOS
    // Cast to any because 'renotify' is valid but missing from some TS lib defs
    await reg.showNotification(title, {
      body,
      icon: '/vite.svg',
      badge: '/vite.svg',
      tag,
      requireInteraction: false,
      silent: false,
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

/** Fallback: plain Notification API. */
function sendViaAPI(title: string, body: string, tag: string): boolean {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, icon: '/vite.svg', tag, silent: false });
    return true;
  } catch {
    return false;
  }
}

async function dispatch(title: string, body: string, tag: string): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  if (isOnCooldown(tag)) return false;

  const apiOk = sendViaAPI(title, body, tag);
  const swOk = await sendViaSW(title, body, tag).catch(() => false);
  const sent = apiOk || swOk;
  if (sent) markFired(tag);
  return sent;
}

// ── Public API ───────────────────────────────────────────────────────────────

const FOCUS_MESSAGES = [
  (min: number) => `Stay in the zone — ${min} min left in your session.`,
  (min: number) => `Quick refocus — you've got ${min} min to go. Make it count.`,
  (min: number) => `You were distracted. ${min} min remaining — get back to it.`,
  (min: number) => `Heads up: ${min} min left. Keep your focus sharp.`,
];

/** Generic distraction / tab-switch nudge. */
export async function sendFocusNotification(minutesRemaining: number): Promise<boolean> {
  const min = Math.max(1, minutesRemaining);
  const msg = FOCUS_MESSAGES[Math.floor(Date.now() / 1000) % FOCUS_MESSAGES.length](min);
  return dispatch('Productifi — Stay Focused 🎯', msg, 'productifi-focus');
}

/** Talking detected — user is speaking out loud during a focus session. */
export async function sendTalkingNotification(minutesRemaining: number): Promise<boolean> {
  const min = Math.max(1, minutesRemaining);
  const messages = [
    `You're talking — pause the conversation and get back to work. ${min} min left.`,
    `Detected speaking. Silence helps deep focus — ${min} min remaining.`,
    `Talking interrupts your flow. Refocus now — ${min} min left.`,
  ];
  const msg = messages[Math.floor(Date.now() / 1000) % messages.length];
  return dispatch('Productifi — Talking Detected 🗣️', msg, 'productifi-talking');
}

/** No face detected — user has stepped away from the desk. */
export async function sendNoFaceNotification(minutesRemaining: number): Promise<boolean> {
  const min = Math.max(1, minutesRemaining);
  const messages = [
    `You've stepped away. ${min} min left — come back and finish strong.`,
    `No face detected. Are you still there? ${min} min remaining.`,
    `You left your desk. Come back and keep your streak going! ${min} min left.`,
  ];
  const msg = messages[Math.floor(Date.now() / 1000) % messages.length];
  return dispatch('Productifi — Where Did You Go? 👀', msg, 'productifi-noface');
}

/** "Stay Focused!" — fired by audioMonitor after 3 s of sustained speech. */
export async function sendStayFocusedNotification(): Promise<boolean> {
  return dispatch('Productifi 🎯 Stay Focused!', "You've been talking for 3+ seconds. Pause and get back to work.", 'productifi-talking');
}

/** Gemini-generated personalised coaching message. */
export async function sendCoachingNotification(coachingMessage: string): Promise<boolean> {
  return dispatch('Productifi Coach 🤖', coachingMessage, 'productifi-coaching');
}

/** Reset all cooldowns at session start so the first alert always fires. */
export function resetNotificationCooldown(): void {
  for (const key of Object.keys(lastFiredAt)) {
    delete lastFiredAt[key];
  }
}

export function sendNotification(title: string, body: string) {
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  } else {
    alert(`${title}: ${body}`); // Fallback for unsupported browsers
  }
}
