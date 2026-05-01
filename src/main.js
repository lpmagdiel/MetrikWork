import { mount } from 'svelte'
import './app.css'
import Layout from './layout.svelte'

import { initAuth, subscribeToTeams, subscribeToTasks, subscribeToNotifications, subscribeToNotes, subscribeToSettings } from './data/index.js';

initAuth((uid) => {
  subscribeToTeams(uid);
  subscribeToTasks(uid);
  subscribeToNotifications(uid);
  subscribeToNotes(uid);
  subscribeToSettings(uid);
});

const app = mount(Layout, {
  target: document.getElementById('app'),
});

export default app
