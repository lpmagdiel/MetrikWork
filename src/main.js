import { mount } from 'svelte'
import './app.css'
import Layout from './layout.svelte'
import { navigateTo } from './router.js';

import { initAuth, initializePushNotifications, subscribeToTeams, subscribeToTasks, subscribeToNotifications, subscribeToNotes, subscribeToLocations, subscribeToSettings } from './data/index.js';

initAuth((uid) => {
  initializePushNotifications(uid);
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
