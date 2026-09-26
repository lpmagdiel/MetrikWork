/**
 * Service Worker de MetricWork.
 *
 * Estrategia: `injectManifest` (Vite Plugin PWA) — Vite inyecta la lista
 * de precache en `self.__WB_MANIFEST` y compila este archivo en
 * `dist/sw.js`.
 *
 * Por qué SW propio: Workbox `generateSW` envuelve el `NetworkOnly`
 * con lógica que rompe las conexiones streaming de Firestore (canales
 * HTTP/2 long-polling con `TYPE=xmlhttp`). La solución es registrar
 * una ruta de máxima prioridad para Firebase que devuelva
 * `fetch(event.request)` tal cual, sin envolver la respuesta.
 */

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
self.clientsClaim();

// Obliga al navegador a detectar esta revisión del passthrough de Firebase.
self.__METRICWORK_SW_VERSION__ = 'firestore-passthrough-2026-09-26-2';

// ---------- Precache ----------
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ---------- Navegación SPA con denylist ----------
// Si Workbox trata una petición a Firebase como navegación devolvería
// index.html y rompería las conexiones streaming de Firestore.
const navigationHandler = createHandlerBoundToURL('/index.html');
const navigationDenylist = [
    /^\/api\//,
    /^https:\/\/firestore\.googleapis\.com\//,
    /^https:\/\/fcm\.googleapis\.com\//,
    /^https:\/\/fcmregistrations\.googleapis\.com\//,
    /^https:\/\/identitytoolkit\.googleapis\.com\//,
    /^https:\/\/securetoken\.googleapis\.com\//,
    /^https:\/\/firebasestorage\.googleapis\.com\//
];
registerRoute(new NavigationRoute(navigationHandler, { denylist: navigationDenylist }));

// ---------- Firebase: passthrough puro (clave para Firestore streaming) ----------
// Llamamos a fetch() directamente y devolvemos la Response tal cual.
// Cualquier envoltorio de Workbox (NetworkOnly, plugins, etc.) rompe
// las conexiones long-polling del canal de escucha de Firestore.
const FIREBASE_HOSTS = new Set([
    'firestore.googleapis.com',
    'fcm.googleapis.com',
    'fcmregistrations.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebasestorage.googleapis.com'
]);
registerRoute(
    ({ url }) => FIREBASE_HOSTS.has(url.hostname),
    ({ event }) => fetch(event.request)
);

// ---------- Imágenes locales ----------
registerRoute(
    ({ url, request }) =>
        request.destination === 'image' && url.origin === self.location.origin,
    new CacheFirst({
        cacheName: 'metricwork-local-images',
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 })
        ]
    })
);

// ---------- Imágenes Cloudinary ----------
registerRoute(
    ({ url, request }) =>
        request.destination === 'image' && url.origin === 'https://res.cloudinary.com',
    new CacheFirst({
        cacheName: 'metricwork-cloudinary-images',
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })
        ]
    })
);
