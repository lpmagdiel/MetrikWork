import { get, writable } from 'svelte/store';

export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_STORAGE_KEY = `metricwork:cookie-consent:v${COOKIE_CONSENT_VERSION}`;

const DEFAULT_COOKIE_CONSENT = {
    version: COOKIE_CONSENT_VERSION,
    essential: true,
    analytics: false,
    decidedAt: '',
    updatedAt: ''
};

function canUseLocalStorage() {
    return typeof localStorage !== 'undefined';
}

function normalizeCookieConsent(value = {}) {
    return {
        ...DEFAULT_COOKIE_CONSENT,
        version: COOKIE_CONSENT_VERSION,
        essential: true,
        analytics: value.analytics === true,
        decidedAt: typeof value.decidedAt === 'string' ? value.decidedAt : '',
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : ''
    };
}

function readCookieConsent() {
    if (!canUseLocalStorage()) return { ...DEFAULT_COOKIE_CONSENT };

    try {
        const rawConsent = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
        if (!rawConsent) return { ...DEFAULT_COOKIE_CONSENT };
        return normalizeCookieConsent(JSON.parse(rawConsent));
    } catch {
        return { ...DEFAULT_COOKIE_CONSENT };
    }
}

export const cookieConsentStore = writable(readCookieConsent());
export const cookiePreferencesOpen = writable(false);

export function hasCookieConsentDecision(consent = get(cookieConsentStore)) {
    return Boolean(consent?.decidedAt);
}

export function saveCookieConsent(nextConsent = {}) {
    const currentConsent = get(cookieConsentStore);
    const now = new Date().toISOString();
    const normalizedConsent = normalizeCookieConsent({
        ...currentConsent,
        ...nextConsent,
        decidedAt: currentConsent.decidedAt || now,
        updatedAt: now
    });

    try {
        if (canUseLocalStorage()) {
            localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(normalizedConsent));
        }
    } catch {
        // La preferencia sigue viva en memoria aunque el almacenamiento no este disponible.
    }

    cookieConsentStore.set(normalizedConsent);
    return normalizedConsent;
}

export function openCookiePreferences() {
    cookiePreferencesOpen.set(true);
}

export function closeCookiePreferences() {
    cookiePreferencesOpen.set(false);
}
