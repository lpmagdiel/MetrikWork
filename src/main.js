import { mount } from 'svelte'
import './app.css'
import Layout from './layout.svelte'
import { navigateTo } from './router.js';
import { captureCurrentUserLocation } from './data/geolocation.js';
import {
  initAuth,
  initializePushNotifications,
  startUserPresence,
  stopUserPresence,
  subscribeToIncomingPrivateCalls,
  subscribeToTeams,
  subscribeToTasks,
  subscribeToNotifications,
  subscribeToNotificationPreferences,
  subscribeToNotes,
  subscribeToLocations,
  subscribeToSettings,
  startOfflineActionsSync
} from './data/index.js';

const CHUNK_RELOAD_URL_KEY = 'metricwork:chunk-reload-url';
const CHUNK_LOAD_ERROR_PATTERN =
  /dynamically imported module|failed to fetch dynamically imported module|importing a module script failed|loading chunk|unable to preload css|module script/i;

function getErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return [error.message, error.name, error.stack].filter(Boolean).join('\n');
}

function reloadForFreshAssets() {
  const currentUrl = window.location.href;

  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_URL_KEY) === currentUrl) return false;
    sessionStorage.setItem(CHUNK_RELOAD_URL_KEY, currentUrl);
  } catch {
    // If sessionStorage is unavailable, a single hard reload is still the best recovery path.
  }

  window.location.reload();
  return true;
}

window.setTimeout(() => {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_URL_KEY) === window.location.href) {
      sessionStorage.removeItem(CHUNK_RELOAD_URL_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}, 10000);

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadForFreshAssets();
});

window.addEventListener('unhandledrejection', (event) => {
  if (!CHUNK_LOAD_ERROR_PATTERN.test(getErrorMessage(event.reason))) return;
  event.preventDefault();
  reloadForFreshAssets();
});

let incomingCallUnsubscribe = null;
const foregroundedCallIds = new Set();

function getIncomingCallUrl(call) {
  const teamId = encodeURIComponent(call.teamId || '');
  const callerId = encodeURIComponent(call.callerId || '');
  const callId = encodeURIComponent(call.id || '');
  return `/teams/${teamId}/chat?mode=private&member=${callerId}&call=${callId}`;
}

function bringIncomingCallToFront(call) {
  if (!call || call.status !== 'ringing' || !call.teamId || !call.callerId || !call.id) return;
  if (foregroundedCallIds.has(call.id)) return;

  foregroundedCallIds.add(call.id);
  if (foregroundedCallIds.size > 50) {
    foregroundedCallIds.delete(foregroundedCallIds.values().next().value);
  }

  window.focus?.();
  navigateTo(getIncomingCallUrl(call));
}

initAuth((uid) => {
  initializePushNotifications(uid);
  incomingCallUnsubscribe?.();
  incomingCallUnsubscribe = null;

  if (uid) {
    startOfflineActionsSync();
    startUserPresence(uid);
    captureCurrentUserLocation();
    incomingCallUnsubscribe = subscribeToIncomingPrivateCalls(uid, bringIncomingCallToFront);
  } else {
    stopUserPresence();
    foregroundedCallIds.clear();
  }

  subscribeToTeams(uid);
  subscribeToTasks(uid);
  subscribeToNotificationPreferences(uid);
  subscribeToNotifications(uid);
  subscribeToNotes(uid);
  subscribeToLocations(uid);
  subscribeToSettings(uid);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'OPEN_URL' && event.data.url) {
      navigateTo(event.data.url);
    }
  });
}

const app = mount(Layout, {
  target: document.getElementById('app'),
});

export default app
