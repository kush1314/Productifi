/**
 * Productifi Service Worker
 * Handles OS-level notifications that fire even when the browser is in
 * the background or the user has switched to another app / monitor.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** Main message handler — the page posts here to show a notification. */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'SHOW_NOTIFICATION') return;

  const options = {
    body: data.body || '',
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: data.tag || 'productifi-focus',
    // Replace any existing notification with the same tag (no stacking)
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Productifi', options));
});

/** Clicking the notification brings the Productifi tab into focus. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('127.0.0.1') || client.url.includes('localhost')) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/');
    }),
  );
});
