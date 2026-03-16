/**
 * Browser-only notification service.
 * - No extension
 * - No service worker dependency
 * - Uses Notification API directly
 */

const DEFAULT_COOLDOWN_MS = 15_000;
let lastNotificationTime = 0;

// ── Simple direct trigger (bypasses all routing complexity) ─────────────────
let simpleTriggerLastMs = 0;
const SIMPLE_TRIGGER_COOLDOWN = 10_000; // 10 seconds

// ── Look-away trigger (fires regardless of tab visibility) ──────────────────
let lookAwayLastMs = 0;
const LOOK_AWAY_COOLDOWN_MS = 15_000;

// ── Session-scoped notification count ───────────────────────────────────────
let sessionNotificationCount = 0;

export function getNotificationsSent(): number {
  return sessionNotificationCount;
}

/**
 * Fires a notification when the user looks away from screen.
 * Does NOT require document.hidden — fires on-tab too.
 * Uses its own 15-second cooldown independent of the speech trigger.
 */
export function triggerLookAwayNotification(message: string): void {
  const now = Date.now();
  console.log('[Notification/LookAway] Attempting trigger', {
    permission: Notification.permission,
    hidden: document.hidden,
    now,
    lastMs: lookAwayLastMs,
  });

  if (Notification.permission !== 'granted') {
    console.log('[Notification/LookAway] Blocked: permission not granted');
    return;
  }

  if (now - lookAwayLastMs < LOOK_AWAY_COOLDOWN_MS) {
    console.log('[Notification/LookAway] Blocked: cooldown active', {
      remainingMs: LOOK_AWAY_COOLDOWN_MS - (now - lookAwayLastMs),
    });
    return;
  }

  try {
    new Notification('Productifi', {
      body: message,
      requireInteraction: true,
    });
    lookAwayLastMs = now;
    sessionNotificationCount++;
    console.log('[Notification/LookAway] Sent successfully');
  } catch (e) {
    console.log('[Notification/LookAway] Send failed', e);
  }
}

/**
 * Fires a Chrome notification immediately when the tab is hidden.
 * Respects a 10-second cooldown. Does NOT fire when tab is visible.
 * This is the primary path for audio-triggered "Stay Focused" notifications.
 */
export function triggerFocusNotification(message: string): void {
  const now = Date.now();
  console.log("[Notification] Attempting trigger", {
    permission: Notification.permission,
    hidden: document.hidden,
    now,
    lastNotificationTime: simpleTriggerLastMs,
  });

  if (Notification.permission !== "granted") {
    console.log("[Notification] Blocked: permission not granted");
    return;
  }

  if (!document.hidden) {
    console.log("[Notification] Blocked: tab is visible");
    return;
  }

  if (now - simpleTriggerLastMs < SIMPLE_TRIGGER_COOLDOWN) {
    console.log("[Notification] Blocked: cooldown active", {
      remainingMs: SIMPLE_TRIGGER_COOLDOWN - (now - simpleTriggerLastMs),
    });
    return;
  }

  try {
    new Notification("Productifi", {
      body: message,
      requireInteraction: true,
    });
    simpleTriggerLastMs = now;
    sessionNotificationCount++;
    console.log("[Notification] Sent successfully");
  } catch (e) {
    console.log("[Notification] Send failed", e);
  }
}

// ── Permission ──────────────────────────────────────────────────────────────

/**
 * Request notification permission during a user gesture.
 * Call this from a button's onClick handler for maximum browser compatibility.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    console.log('[Productifi] Notifications not supported in this browser');
    return 'denied';
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    console.log('[Productifi] Notification permission result:', permission);
    return permission;
  }

  return Notification.permission;
}

/**
 * Architecture step 1: ask permission at session start.
 */
export async function enableNotifications(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    console.log('Notifications not supported');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    console.log('Notifications enabled');
  } else {
    console.log('Notifications denied');
  }
  return permission;
}

/**
 * Architecture step 2: reliable browser notification sender.
 */
export function sendFocusNotification(message: string | number): boolean {
  if (!("Notification" in window)) {
    console.log('[Productifi] Notification API unavailable');
    return false;
  }

  if (Notification.permission !== 'granted') {
    console.log('[Productifi] Notification skipped: permission is', Notification.permission);
    return false;
  }

  const body = typeof message === 'number'
    ? `Stay focused - ${Math.max(1, message)} min left in your session.`
    : message;

  console.log('[Productifi] Triggering focus notification', {
    body,
    hidden: typeof document !== 'undefined' ? document.hidden : false,
  });

  try {
    new Notification('Productifi', {
      body,
      icon: '/vite.svg',
      silent: false,
      tag: 'productifi-focus',
    });
    return true;
  } catch {
    console.log('[Productifi] Notification send failed');
    return false;
  }
}

/**
 * Architecture step 4: cooldown wrapper to prevent notification spam.
 */
export function notifyWithCooldown(message: string, cooldownMs = DEFAULT_COOLDOWN_MS): boolean {
  const now = Date.now();
  if (now - lastNotificationTime <= cooldownMs) {
    console.log('[Productifi] Notification cooldown active, skipping notification', {
      waitMs: cooldownMs - (now - lastNotificationTime),
      message,
    });
    return false;
  }

  const sent = sendFocusNotification(message);
  if (sent) lastNotificationTime = now;
  return sent;
}

export const notifyFocusWithCooldown = notifyWithCooldown;

export function sendFocusNotificationMessage(message: string): boolean {
  return sendFocusNotification(message);
}

// ── Public API ───────────────────────────────────────────────────────────────

const FOCUS_MESSAGES = [
  (min: number) => `Stay in the zone — ${min} min left in your session.`,
  (min: number) => `Quick refocus — you've got ${min} min to go. Make it count.`,
  (min: number) => `You were distracted. ${min} min remaining — get back to it.`,
  (min: number) => `Heads up: ${min} min left. Keep your focus sharp.`,
];

/** Generic distraction / tab-switch nudge. */
export async function sendTimedFocusNotification(minutesRemaining: number): Promise<boolean> {
  const min = Math.max(1, minutesRemaining);
  const msg = FOCUS_MESSAGES[Math.floor(Date.now() / 1000) % FOCUS_MESSAGES.length](min);
  return notifyWithCooldown(msg, DEFAULT_COOLDOWN_MS);
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
  const sentPrimary = notifyWithCooldown('Conversation detected. Refocus now.', DEFAULT_COOLDOWN_MS);
  const sentSecondary = notifyWithCooldown(msg, DEFAULT_COOLDOWN_MS);
  return sentPrimary || sentSecondary;
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
  return notifyWithCooldown(msg, DEFAULT_COOLDOWN_MS);
}

/** Fired as soon as speech is detected. */
export async function sendStayFocusedNotification(): Promise<boolean> {
  return notifyWithCooldown('Stay focused — talking detected.', DEFAULT_COOLDOWN_MS);
}

/**
 * Used when the user is on another tab. Respects the same 15s cooldown
 * so it doesn't spam but fires on the first speech event after cooldown.
 */
export async function sendGuaranteedStayFocusedNotification(
  message = 'Stay focused — talking detected.',
): Promise<boolean> {
  return notifyWithCooldown(message, DEFAULT_COOLDOWN_MS);
}

export interface NotificationSelfTestResult {
  ok: boolean;
  detail: string;
}

export async function runNotificationSelfTest(): Promise<NotificationSelfTestResult> {
  if (!("Notification" in window)) {
    return { ok: false, detail: 'Notification API unavailable in this browser.' };
  }

  const permission = await enableNotifications();
  if (permission !== 'granted') {
    return { ok: false, detail: `Permission is ${permission}.` };
  }

  const details: string[] = [];
  details.push(`Origin: ${window.location.origin}`);
  details.push(`Hidden: ${document.hidden}`);
  details.push(`Secure context: ${window.isSecureContext}`);

  const sent = sendFocusNotification('Notification self-test: Productifi notifications are active.');
  details.push(`API send: ${sent ? 'OK' : 'FAIL'}`);

  return {
    ok: sent,
    detail: details.join(' | '),
  };
}

/** Gemini-generated personalised coaching message. */
export async function sendCoachingNotification(coachingMessage: string): Promise<boolean> {
  return notifyWithCooldown(coachingMessage, 30_000);
}

/** Reset all cooldowns and session counter at session start so the first alert always fires. */
export function resetNotificationCooldown(): void {
  lastNotificationTime = 0;
  simpleTriggerLastMs = 0;
  lookAwayLastMs = 0;
  sessionNotificationCount = 0;
}

export function sendNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/vite.svg', silent: false });
}
