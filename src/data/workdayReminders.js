import { get } from 'svelte/store';
import { settingsStore, userStore } from './auth.js';
import { showDeviceNotification } from './pushNotifications.js';

export const DEFAULT_WORKDAY_REMINDER_TIME = '09:00';

let reminderTimeoutId = null;
let settingsUnsubscribe = null;

function normalizeReminderTime(time) {
    if (typeof time !== 'string') return DEFAULT_WORKDAY_REMINDER_TIME;
    const trimmed = time.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) return DEFAULT_WORKDAY_REMINDER_TIME;

    const [hours, minutes] = trimmed.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return DEFAULT_WORKDAY_REMINDER_TIME;
    }

    return trimmed;
}

export function normalizeWorkdayReminderSettings(settings = {}) {
    return {
        enabled: settings?.workdayReminderEnabled === true,
        time: normalizeReminderTime(settings?.workdayReminderTime),
    };
}

function clearReminderTimeout() {
    if (!reminderTimeoutId) return;
    window.clearTimeout(reminderTimeoutId);
    reminderTimeoutId = null;
}

function getDateKey(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function getNextReminderDate(time) {
    const [hours, minutes] = time.split(':').map(Number);
    const nextDate = new Date();
    nextDate.setHours(hours, minutes, 0, 0);

    if (nextDate.getTime() <= Date.now()) {
        nextDate.setDate(nextDate.getDate() + 1);
    }

    return nextDate;
}

function getReminderStorageKey(user, dateKey) {
    const userId = user?.uid || 'anonymous';
    return `metricwork:workday-reminder:${userId}:${dateKey}`;
}

async function showWorkdayReminder() {
    const now = new Date();
    const dateKey = getDateKey(now);
    const storageKey = getReminderStorageKey(get(userStore), dateKey);

    try {
        if (window.localStorage.getItem(storageKey) === 'shown') return;
    } catch {
        // If storage is blocked, still try to show the notification.
    }

    const wasShown = await showDeviceNotification({
        id: `workday-reminder-${dateKey}`,
        title: 'Recordatorio de jornada',
        message: 'No olvides fichar tu jornada de trabajo.',
        url: '/home',
    });

    if (!wasShown) return;

    try {
        window.localStorage.setItem(storageKey, 'shown');
    } catch {
        // Storage is only used to avoid duplicates, not required for the reminder.
    }
}

function scheduleReminder(settings) {
    clearReminderTimeout();

    const reminder = normalizeWorkdayReminderSettings(settings);
    if (!reminder.enabled) return;

    const nextReminderDate = getNextReminderDate(reminder.time);
    const delay = Math.max(nextReminderDate.getTime() - Date.now(), 1000);

    reminderTimeoutId = window.setTimeout(async () => {
        await showWorkdayReminder();
        scheduleReminder(get(settingsStore));
    }, delay);
}

export function initializeWorkdayReminderScheduler() {
    if (typeof window === 'undefined' || settingsUnsubscribe) return;

    settingsUnsubscribe = settingsStore.subscribe(scheduleReminder);

    window.addEventListener('focus', () => scheduleReminder(get(settingsStore)));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            scheduleReminder(get(settingsStore));
        }
    });
}
