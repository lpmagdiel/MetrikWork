import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { notificationId } = parseBody(req);
    if (!notificationId || typeof notificationId !== 'string') {
      return sendJson(res, 400, { error: 'notificationId is required' });
    }

    const projectId = getProjectId();
    const accessToken = await getAccessToken();
    const notification = await getFirestoreDocument(projectId, accessToken, `notifications/${notificationId}`);

    if (!notification) {
      return sendJson(res, 404, { error: 'Notification not found' });
    }

    if (notification.fields?.pushSentAt) {
      return sendJson(res, 200, { sent: 0, skipped: true, reason: 'already_sent' });
    }

    const title = getStringField(notification.fields, 'title') || 'MetricWork';
    const body = getStringField(notification.fields, 'message');
    const notificationFor = getStringField(notification.fields, 'notificationFor');
    const url = getStringField(notification.fields, 'url') || '/notifications';
    const type = getStringField(notification.fields, 'type');
    const showInForeground = getBooleanField(notification.fields, 'showInForeground');

    if (!notificationFor) {
      return sendJson(res, 400, { error: 'Notification has no recipient' });
    }

    const tokens = await getPushTokens(projectId, accessToken, notificationFor);
    if (tokens.length === 0) {
      return sendJson(res, 200, { sent: 0, skipped: true, reason: 'no_tokens' });
    }

    const origin = getOrigin(req);
    const results = await Promise.allSettled(
      tokens.map((token) => sendFcmMessage(projectId, accessToken, token, {
        title,
        body,
        notificationId,
        origin,
        url,
        type,
        showInForeground,
      }))
    );

    const sent = results.filter((result) => result.status === 'fulfilled').length;
    if (sent > 0) {
      await markPushAsSent(projectId, accessToken, notificationId);
    }

    return sendJson(res, 200, {
      sent,
      failed: results.length - sent,
    });
  } catch (error) {
    console.error('send-push-notification error:', error);
    if (isLocalEnvironment() && isPushConfigurationError(error)) {
      return sendJson(res, 200, {
        sent: 0,
        skipped: true,
        reason: 'push_not_configured',
      });
    }
    return sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
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
    scope: `${FCM_SCOPE} ${FIRESTORE_SCOPE}`,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  const assertion = `${unsignedToken}.${signature}`;

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

async function getFirestoreDocument(projectId, accessToken, documentPath) {
  const response = await fetch(getFirestoreUrl(projectId, documentPath), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not read Firestore document');
  }
  return payload;
}

async function getPushTokens(projectId, accessToken, uid) {
  const url = getFirestoreUrl(projectId, `users/${uid}/pushTokens`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return [];

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not read push tokens');
  }

  return (payload.documents || [])
    .map((document) => getStringField(document.fields, 'token'))
    .filter(Boolean);
}

async function markPushAsSent(projectId, accessToken, notificationId) {
  const url = `${getFirestoreUrl(projectId, `notifications/${notificationId}`)}?updateMask.fieldPaths=pushSentAt`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        pushSentAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || 'Could not update push status');
  }
}

async function sendFcmMessage(projectId, accessToken, token, notification) {
  const url = normalizeAppUrl(notification.url);
  const absoluteUrl = `${notification.origin}${url}`;
  const isChatNotification = notification.type === 'chat_message' ||
    notification.type === 'private_chat_message';
  const data = {
    notificationId: notification.notificationId,
    url,
    title: notification.title,
    body: notification.body || '',
  };

  if (notification.type) {
    data.type = notification.type;
  }

  if (typeof notification.showInForeground === 'boolean') {
    data.showInForeground = String(notification.showInForeground);
  }

  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        ...(isChatNotification ? {} : {
          notification: {
            title: notification.title,
            body: notification.body,
          },
        }),
        data,
        webpush: {
          fcm_options: {
            link: absoluteUrl,
          },
          ...(isChatNotification ? {} : {
            notification: {
              icon: `${notification.origin}/icon.png`,
              badge: `${notification.origin}/icons/android/launchericon-192x192.png`,
              tag: `metricwork-${notification.notificationId}`,
              renotify: true,
            },
          }),
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not send FCM message');
  }
  return payload;
}

function getFirestoreUrl(projectId, documentPath) {
  const encodedPath = documentPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encodedPath}`;
}

function getStringField(fields, name) {
  return fields?.[name]?.stringValue || '';
}

function getBooleanField(fields, name) {
  const field = fields?.[name];
  if (!field || typeof field.booleanValue === 'undefined') return null;
  return field.booleanValue;
}

function normalizeAppUrl(url) {
  if (!url || typeof url !== 'string') return '/notifications';
  if (!url.startsWith('/')) return '/notifications';
  return url;
}

function getOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function isLocalEnvironment() {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
}

function isPushConfigurationError(error) {
  const message = error?.message || '';
  return message.includes('FIREBASE_CLIENT_EMAIL') ||
    message.includes('FIREBASE_PRIVATE_KEY') ||
    message.includes('FIREBASE_PROJECT_ID');
}
