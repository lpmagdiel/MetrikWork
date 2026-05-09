importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

const config = Object.fromEntries(new URL(self.location.href).searchParams.entries());

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  firebase.initializeApp(config);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = notification.title || data.title || 'MetricWork';
    const options = {
      body: notification.body || data.body || data.message || '',
      icon: '/icon.png',
      badge: '/icons/android/launchericon-192x192.png',
      tag: data.notificationId ? `metricwork-${data.notificationId}` : payload.messageId,
      renotify: Boolean(data.notificationId),
      data: {
        url: data.url || '/notifications',
        notificationId: data.notificationId || '',
      },
    };

    self.registration.showNotification(title, options);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matchingClient = clientList.find((client) => client.url.startsWith(self.location.origin));

    if (matchingClient) {
      await matchingClient.focus();
      matchingClient.postMessage({ type: 'OPEN_URL', url });
      return;
    }

    await clients.openWindow(targetUrl);
  })());
});
