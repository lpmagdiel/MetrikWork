export const SYSTEM_ADMIN_EMAILS = Object.freeze([
    'lpzcode@yahoo.com',
    'lopmag.lopez@gmail.com',
    'fabiansolares719@gmail.com'
]);

export function normalizeSystemAdminEmail(value) {
    return String(value || '').replace(/\s+/g, '').toLowerCase();
}

export function isConfiguredSystemAdmin(value) {
    return SYSTEM_ADMIN_EMAILS.includes(normalizeSystemAdminEmail(value));
}
