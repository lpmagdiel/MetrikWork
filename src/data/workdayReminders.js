import { get } from 'svelte/store';
import { settingsStore, userStore } from './auth.js';
import { createReminderNotification } from './notifications.js';
import { showDeviceNotification } from './pushNotifications.js';

export const DEFAULT_REMINDER_TIME = '09:00';
export const DEFAULT_WORKDAY_REMINDER_TIME = DEFAULT_REMINDER_TIME;
export const DEFAULT_REMINDER_MESSAGE = 'Fichar mi jornada de trabajo';

const REMINDER_MESSAGE_MAX_LENGTH = 180;
const MISSED_REMINDER_GRACE_MS = 18 * 60 * 60 * 1000;

let reminderTimeoutId = null;
let settingsUnsubscribe = null;

function normalizeReminderTime(time) {
    if (typeof time !== 'string') return DEFAULT_REMINDER_TIME;
    const trimmed = time.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) return DEFAULT_REMINDER_TIME;

    const [hours, minutes] = trimmed.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return DEFAULT_REMINDER_TIME;
    }

    return trimmed;
}

function normalizeReminderMessage(message) {
    if (typeof message !== 'string') return DEFAULT_REMINDER_MESSAGE;
    const trimmed = message.trim().replace(/\s+/g, ' ');
    return trimmed ? trimmed.slice(0, REMINDER_MESSAGE_MAX_LENGTH) : DEFAULT_REMINDER_MESSAGE;
}

export function getLocalReminderTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

function normalizeReminderTimeZone(timeZone) {
    const fallbackTimeZone = getLocalReminderTimeZone();
    if (typeof timeZone !== 'string' || !timeZone.trim()) return fallbackTimeZone;

    const trimmed = timeZone.trim();
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
        return trimmed;
    } catch {
        return fallbackTimeZone;
    }
}

export function normalizeReminderSettings(settings = {}) {
    const hasGenericEnabled = typeof settings?.reminderEnabled === 'boolean';

    return {
        enabled: hasGenericEnabled
            ? settings.reminderEnabled === true
            : settings?.workdayReminderEnabled === true,
        time: normalizeReminderTime(settings?.reminderTime || settings?.workdayReminderTime),
        message: normalizeReminderMessage(settings?.reminderMessage || settings?.workdayReminderMessage),
        timeZone: normalizeReminderTimeZone(settings?.reminderTimeZone),
        updatedAt: settings?.updatedAt || '',
    };
}

export const normalizeWorkdayReminderSettings = normalizeReminderSettings;

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

function getReminderDateFor(date, time) {
    const [hours, minutes] = time.split(':').map(Number);
    const reminderDate = new Date(date);
    reminderDate.setHours(hours, minutes, 0, 0);
    return reminderDate;
}

function getNextReminderDate(time) {
    const nextDate = getReminderDateFor(new Date(), time);

    if (nextDate.getTime() <= Date.now()) {
        nextDate.setDate(nextDate.getDate() + 1);
    }

    return nextDate;
}

function getReminderStorageKey(user, dateKey) {
    const userId = user?.uid || 'anonymous';
    return `metricwork:reminder:${userId}:${dateKey}`;
}

function getLegacyReminderStorageKey(user, dateKey) {
    const userId = user?.uid || 'anonymous';
    return `metricwork:workday-reminder:${userId}:${dateKey}`;
}

function wasReminderAlreadyShown(user, dateKey) {
    try {
        return window.localStorage.getItem(getReminderStorageKey(user, dateKey)) === 'shown' ||
            window.localStorage.getItem(getLegacyReminderStorageKey(user, dateKey)) === 'shown';
    } catch {
        return false;
    }
}

function markReminderAsShown(user, dateKey) {
    try {
        window.localStorage.setItem(getReminderStorageKey(user, dateKey), 'shown');
    } catch {
        // Storage is only used to avoid duplicates, not required for the reminder.
    }
}

function wasReminderConfiguredBefore(settings, reminderDate) {
    const updatedAtMs = Date.parse(settings?.updatedAt || '');
    return Number.isNaN(updatedAtMs) || updatedAtMs <= reminderDate.getTime();
}

async function showReminder(settings, reminderDate) {
    const user = get(userStore);
    if (!user?.uid) return false;

    const reminder = normalizeReminderSettings(settings);
    const dateKey = getDateKey(reminderDate);
    if (wasReminderAlreadyShown(user, dateKey)) return false;

    const notificationResult = await createReminderNotification(user.uid, {
        dateKey,
        message: reminder.message,
        time: reminder.time,
        timeZone: reminder.timeZone,
        source: 'local',
    });

    if (!notificationResult?.id) return false;
    if (!notificationResult.created) {
        markReminderAsShown(user, dateKey);
        return false;
    }

    await showDeviceNotification({
        id: notificationResult.id,
        title: 'Recordatorio',
        message: reminder.message,
        url: '/notifications',
    });

    markReminderAsShown(user, dateKey);
    return true;
}

async function showDueReminder(settings) {
    const reminder = normalizeReminderSettings(settings);
    if (!reminder.enabled) return false;

    const now = new Date();
    const reminderDate = getReminderDateFor(now, reminder.time);
    const elapsed = Date.now() - reminderDate.getTime();
    if (elapsed < 0 || elapsed > MISSED_REMINDER_GRACE_MS) return false;
    if (!wasReminderConfiguredBefore(settings, reminderDate)) return false;

    return showReminder(settings, reminderDate);
}

function scheduleReminder(settings) {
    clearReminderTimeout();

    const reminder = normalizeReminderSettings(settings);
    if (!reminder.enabled) return;

    showDueReminder(settings).catch((error) => {
        console.error('Error showing reminder:', error);
    });

    const nextReminderDate = getNextReminderDate(reminder.time);
    const delay = Math.max(nextReminderDate.getTime() - Date.now(), 1000);

    reminderTimeoutId = window.setTimeout(async () => {
        await showReminder(get(settingsStore), nextReminderDate);
        scheduleReminder(get(settingsStore));
    }, delay);
}

export function initializeReminderScheduler() {
    if (typeof window === 'undefined' || settingsUnsubscribe) return;

    settingsUnsubscribe = settingsStore.subscribe(scheduleReminder);

    window.addEventListener('focus', () => scheduleReminder(get(settingsStore)));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            scheduleReminder(get(settingsStore));
        }
    });
}

export const initializeWorkdayReminderScheduler = initializeReminderScheduler;
