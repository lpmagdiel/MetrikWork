import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const DEFAULT_REMINDER_TIME = '09:00';
const DEFAULT_REMINDER_MESSAGE = 'Fichar mi jornada de trabajo';
const DEFAULT_DELIVERY_WINDOW_MINUTES = 65;
const DEFAULT_SETTINGS_QUERY_LIMIT = 1000;

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!isCronRequestAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  try {
    const projectId = getProjectId();
    const accessToken = await getAccessToken();
    const settingsDocuments = await getReminderSettingsDocuments(projectId, accessToken);
    const now = new Date();
    const origin = getOrigin(req);

    let due = 0;
    let created = 0;
    let alreadyCreated = 0;
    let pushRequested = 0;
    let pushFailed = 0;

    for (const settingsDocument of settingsDocuments) {
      const reminder = normalizeReminderSettings(settingsDocument.fields);
      const dueReminder = getDueReminder(reminder, now);
      if (!dueReminder) continue;

      due += 1;
      const notificationId = getReminderNotificationId(settingsDocument.uid, dueReminder.dateKey);
      const createResult = await createReminderNotificationDocument(
        projectId,
        accessToken,
        notificationId,
        settingsDocument.uid,
        reminder,
        dueReminder.dateKey,
        now
      );

      if (!createResult.created) {
        alreadyCreated += 1;
        continue;
      }

      created += 1;
      const pushResult = await requestPushDelivery(origin, notificationId);
      pushRequested += 1;
      if (!pushResult.ok) pushFailed += 1;
    }

    return sendJson(res, 200, {
      checked: settingsDocuments.length,
      due,
      created,
      alreadyCreated,
      pushRequested,
      pushFailed,
    });
  } catch (error) {
    console.error('send-reminders error:', error);
    return sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
}

function isCronRequestAuthorized(req) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return true;
  return getHeader(req, 'authorization') === `Bearer ${secret}`;
}

function getHeader(req, name) {
  const headers = req.headers || {};
  return headers[name.toLowerCase()] || headers[name] || '';
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getProjectId() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not configured');
  return projectId;
}

function getServiceAccountConfig() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_PRIVATE_KEY,
    process.env.FIREBASE_PRIVATE_KEY_BASE64
  );
  if (!clientEmail || !privateKey) {
    throw new Error('FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required');
  }
  return { clientEmail, privateKey };
}

function normalizePrivateKey(rawPrivateKey, base64PrivateKey) {
  let privateKey = (rawPrivateKey || '').trim();
  const base64Key = (base64PrivateKey || '').trim();

  if (!privateKey && base64Key) {
    privateKey = Buffer.from(base64Key, 'base64').toString('utf8').trim();
  }

  if (!privateKey) return '';

  if (
    (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    privateKey = privateKey.slice(1, -1);
  }

  privateKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('\n')) {
    privateKey = privateKey
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----')
      .replace(/([A-Za-z0-9+/=]{64})/g, '$1\n');
  }

  try {
    return crypto.createPrivateKey(privateKey).export({
      format: 'pem',
      type: 'pkcs8',
    });
  } catch {
    const compactKey = privateKey.replace(/\s/g, '');
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(compactKey)) {
      try {
        return crypto.createPrivateKey(wrapPemBody(compactKey)).export({
          format: 'pem',
          type: 'pkcs8',
        });
      } catch {
        // It may be a DER-encoded PKCS8 key instead of a PEM body.
      }

      try {
        return crypto.createPrivateKey({
          key: Buffer.from(compactKey, 'base64'),
          format: 'der',
          type: 'pkcs8',
        }).export({
          format: 'pem',
          type: 'pkcs8',
        });
      } catch {
        // Surface the standard configuration hint below.
      }
    }
  }

  throw new Error(
    'FIREBASE_PRIVATE_KEY is not a valid private key. Use the full service account private_key with escaped newlines (\\n), PEM/DER base64, or FIREBASE_PRIVATE_KEY_BASE64.'
  );
}

function wrapPemBody(base64Body) {
  const lines = base64Body.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessTokenExpiresAt - 60 > now) {
    return cachedAccessToken;
  }

  const { clientEmail, privateKey } = getServiceAccountConfig();
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    aud: TOKEN_URL,
    scope: FIRESTORE_SCOPE,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Could not get Google access token');
  }

  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = now + Number(payload.expires_in || 3600);
  return cachedAccessToken;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function getReminderSettingsDocuments(projectId, accessToken) {
  const documentsByUid = new Map();

  for (const enabledField of ['workdayReminderEnabled', 'reminderEnabled']) {
    const documents = await runSettingsQuery(projectId, accessToken, enabledField);
    for (const document of documents) {
      const uid = getUidFromSettingsDocumentName(document.name);
      if (!uid) continue;
      documentsByUid.set(uid, {
        uid,
        name: document.name,
        fields: document.fields || {},
      });
    }
  }

  return [...documentsByUid.values()];
}

async function runSettingsQuery(projectId, accessToken, enabledField) {
  const response = await fetch(`${getFirestoreBaseUrl(projectId)}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'settings', allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: enabledField },
            op: 'EQUAL',
            value: { booleanValue: true },
          },
        },
        limit: getSettingsQueryLimit(),
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not query reminder settings');
  }

  return payload
    .map((result) => result.document)
    .filter(Boolean)
    .filter((document) => document.name.endsWith('/settings/default'));
}

function getSettingsQueryLimit() {
  const configuredLimit = Number(process.env.REMINDER_SETTINGS_QUERY_LIMIT || '');
  if (Number.isInteger(configuredLimit) && configuredLimit > 0) {
    return configuredLimit;
  }
  return DEFAULT_SETTINGS_QUERY_LIMIT;
}

function getUidFromSettingsDocumentName(name = '') {
  const match = name.match(/\/documents\/users\/([^/]+)\/settings\/default$/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function normalizeReminderSettings(fields = {}) {
  const hasGenericEnabled = Object.prototype.hasOwnProperty.call(fields, 'reminderEnabled');
  const enabled = hasGenericEnabled
    ? getBooleanField(fields, 'reminderEnabled') === true
    : getBooleanField(fields, 'workdayReminderEnabled') === true;

  return {
    enabled,
    time: normalizeReminderTime(getStringField(fields, 'reminderTime') || getStringField(fields, 'workdayReminderTime')),
    message: normalizeReminderMessage(getStringField(fields, 'reminderMessage')),
    timeZone: normalizeReminderTimeZone(
      getStringField(fields, 'reminderTimeZone') ||
      getStringField(fields, 'timeZone') ||
      process.env.DEFAULT_REMINDER_TIME_ZONE ||
      'UTC'
    ),
    updatedAt: getStringField(fields, 'updatedAt'),
  };
}

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
  return trimmed ? trimmed.slice(0, 180) : DEFAULT_REMINDER_MESSAGE;
}

function normalizeReminderTimeZone(timeZone) {
  const trimmed = String(timeZone || '').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return 'UTC';
  }
}

function getDueReminder(reminder, now) {
  if (!reminder.enabled) return null;

  const deliveryWindowMinutes = getDeliveryWindowMinutes();
  const currentLocalTime = getLocalTimeParts(now, reminder.timeZone);
  const [targetHours, targetMinutes] = reminder.time.split(':').map(Number);
  const targetMinuteOfDay = targetHours * 60 + targetMinutes;
  let elapsedMinutes = currentLocalTime.minuteOfDay - targetMinuteOfDay;

  if (elapsedMinutes < 0) {
    elapsedMinutes += 24 * 60;
  }

  if (elapsedMinutes >= deliveryWindowMinutes) return null;

  const scheduledAt = new Date(now.getTime() - elapsedMinutes * 60 * 1000);
  if (!wasReminderConfiguredBefore(reminder, scheduledAt)) return null;

  return {
    dateKey: getLocalDateKey(scheduledAt, reminder.timeZone),
    elapsedMinutes,
  };
}

function getDeliveryWindowMinutes() {
  const configuredWindow = Number(process.env.REMINDER_DELIVERY_WINDOW_MINUTES || '');
  if (Number.isFinite(configuredWindow) && configuredWindow > 0) {
    return configuredWindow;
  }
  return DEFAULT_DELIVERY_WINDOW_MINUTES;
}

function wasReminderConfiguredBefore(reminder, scheduledAt) {
  const updatedAtMs = Date.parse(reminder.updatedAt || '');
  return Number.isNaN(updatedAtMs) || updatedAtMs <= scheduledAt.getTime();
}

function getLocalTimeParts(date, timeZone) {
  const parts = getDateTimeParts(date, timeZone);
  const hour = parts.hour === 24 ? 0 : parts.hour;
  return {
    dateKey: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
    minuteOfDay: hour * 60 + parts.minute,
  };
}

function getLocalDateKey(date, timeZone) {
  const parts = getDateTimeParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function getDateTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getReminderNotificationId(uid, dateKey) {
  return `reminder_${encodeURIComponent(uid || 'user')}_${dateKey}`;
}

async function createReminderNotificationDocument(projectId, accessToken, notificationId, uid, reminder, dateKey, now) {
  const response = await fetch(`${getFirestoreUrl(projectId, 'notifications')}?documentId=${encodeURIComponent(notificationId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        title: { stringValue: 'Recordatorio' },
        message: { stringValue: reminder.message },
        date: { stringValue: now.toISOString() },
        notificationFor: { stringValue: uid },
        opened: { booleanValue: false },
        url: { stringValue: '/notifications' },
        type: { stringValue: 'personal_reminder' },
        sourceId: { stringValue: dateKey },
        showInForeground: { booleanValue: true },
        reminderDateKey: { stringValue: dateKey },
        reminderTime: { stringValue: reminder.time },
        reminderTimeZone: { stringValue: reminder.timeZone },
        reminderSource: { stringValue: 'cron' },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (response.status === 409 || payload.error?.status === 'ALREADY_EXISTS') {
    return { created: false, reason: 'already_exists' };
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not create reminder notification');
  }

  return { created: true };
}

async function requestPushDelivery(origin, notificationId) {
  try {
    const response = await fetch(`${origin}/api/send-push-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId }),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    console.warn('Reminder push request failed:', error);
    return { ok: false, error: error.message || 'Push request failed' };
  }
}

function getFirestoreBaseUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function getFirestoreUrl(projectId, documentPath) {
  const encodedPath = documentPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${getFirestoreBaseUrl(projectId)}/${encodedPath}`;
}

function getStringField(fields, name) {
  return fields?.[name]?.stringValue || '';
}

function getBooleanField(fields, name) {
  const field = fields?.[name];
  if (!field || typeof field.booleanValue === 'undefined') return null;
  return field.booleanValue;
}

function getOrigin(req) {
  const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host');
  const proto = getHeader(req, 'x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}
