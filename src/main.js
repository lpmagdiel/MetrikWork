import { mount } from 'svelte'
import './app.css'
import Layout from './layout.svelte'
import { navigateTo } from './router.js';

import {
  initAuth,
  initializePushNotifications,
  startUserPresence,
  stopUserPresence,
  subscribeToIncomingPrivateCalls,
  subscribeToTeams,
  subscribeToTasks,
  subscribeToNotifications,
  subscribeToNotes,
  subscribeToLocations,
  subscribeToSettings,
  startOfflineActionsSync
} from './data/index.js';

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
    incomingCallUnsubscribe = subscribeToIncomingPrivateCalls(uid, bringIncomingCallToFront);
  } else {
    stopUserPresence();
    foregroundedCallIds.clear();
  }

  subscribeToTeams(uid);
  subscribeToTasks(uid);
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
