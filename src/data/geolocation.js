import { get, writable } from "svelte/store";
import { settingsStore } from "./auth.js";

const USER_LOCATION_STORAGE_KEY = "metricwork:user-location";

export const GEOLOCATION_ERRORS = {
  unsupported: "Tu navegador no permite obtener la ubicación GPS.",
  insecure:
    "La ubicación GPS solo funciona en HTTPS o en localhost. Abre la app desde una conexión segura.",
  denied:
    "Permiso de ubicación denegado. Revisa los permisos del sitio en el navegador y vuelve a intentarlo.",
  unavailable:
    "No se pudo obtener tu ubicación actual. Comprueba que el GPS esté activo y vuelve a intentarlo.",
  timeout: "La solicitud de ubicación tardó demasiado. Inténtalo de nuevo.",
  blocked:
    "El navegador bloqueó el acceso a la ubicación. Revisa los permisos del sitio o del dispositivo.",
  disabled:
    "La ubicación está desactivada en tus ajustes. Activa Permitir ubicación para usar GPS.",
  permissionNeeded:
    "El permiso de ubicación está pendiente. Actívalo desde Ajustes para usar GPS.",
  unknown: "No se pudo obtener tu ubicación actual.",
};

export function normalizeLocationSettings(settings = {}) {
  return {
    enabled: settings?.locationEnabled !== false,
  };
}

export function isLocationEnabled(settings = get(settingsStore) || {}) {
  return normalizeLocationSettings(settings).enabled;
}

function normalizeGpsPosition(value) {
  const lat = Number(value?.lat);
  const lon = Number(value?.lon ?? value?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    lat,
    lon,
    accuracy: Number.isFinite(Number(value?.accuracy)) ? Number(value.accuracy) : null,
    updatedAt: value?.updatedAt || new Date().toISOString(),
  };
}

function loadStoredUserLocation() {
  if (typeof localStorage === "undefined") return null;

  try {
    return normalizeGpsPosition(JSON.parse(localStorage.getItem(USER_LOCATION_STORAGE_KEY) || "null"));
  } catch {
    return null;
  }
}

export const currentUserLocation = writable(loadStoredUserLocation());

export function storeCurrentUserLocation(gps) {
  const normalizedLocation = normalizeGpsPosition(gps);
  if (!normalizedLocation) return null;

  currentUserLocation.set(normalizedLocation);

  try {
    localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(normalizedLocation));
  } catch {
    // Local storage can be unavailable in private mode; the in-memory store still works.
  }

  return normalizedLocation;
}

export function clearCurrentUserLocation() {
  currentUserLocation.set(null);

  try {
    localStorage.removeItem(USER_LOCATION_STORAGE_KEY);
  } catch {
    // Local storage can be unavailable in private mode; clearing the store is enough.
  }
}

function getGeolocationErrorMessage(error) {
  if (!error) return GEOLOCATION_ERRORS.unknown;

  const messages = {
    1: GEOLOCATION_ERRORS.denied,
    2: GEOLOCATION_ERRORS.unavailable,
    3: GEOLOCATION_ERRORS.timeout,
  };

  return messages[error.code] || error.message || GEOLOCATION_ERRORS.unknown;
}

export async function getLocationPermissionState() {
  if (typeof navigator === "undefined") return null;
  if (!navigator.permissions?.query) return null;

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    return permission.state;
  } catch (error) {
    return null;
  }
}

export async function getCurrentGpsPosition({ prompt = false, settings = null } = {}) {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error(GEOLOCATION_ERRORS.unsupported);
  }

  if (!isLocationEnabled(settings || get(settingsStore) || {})) {
    throw new Error(GEOLOCATION_ERRORS.disabled);
  }

  if (!navigator.geolocation) {
    throw new Error(GEOLOCATION_ERRORS.unsupported);
  }

  if (!window.isSecureContext) {
    throw new Error(GEOLOCATION_ERRORS.insecure);
  }

  const permissionState = await getLocationPermissionState();
  if (permissionState === "denied") {
    throw new Error(GEOLOCATION_ERRORS.denied);
  }

  if (!prompt && permissionState !== "granted") {
    throw new Error(GEOLOCATION_ERRORS.permissionNeeded);
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gps = {
          lat: position.coords.latitude.toFixed(6),
          lon: position.coords.longitude.toFixed(6),
          accuracy: position.coords.accuracy,
        };
        storeCurrentUserLocation(gps);
        resolve(gps);
      },
      (error) => {
        reject(new Error(getGeolocationErrorMessage(error)));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  });
}

export async function captureCurrentUserLocation({ silent = true, prompt = false } = {}) {
  try {
    return await getCurrentGpsPosition({ prompt });
  } catch (error) {
    if (!silent) throw error;
    if (
      error?.message === GEOLOCATION_ERRORS.disabled ||
      error?.message === GEOLOCATION_ERRORS.permissionNeeded
    ) {
      return null;
    }
    console.warn("No se pudo capturar la ubicación del usuario:", error?.message || error);
    return null;
  }
}

export async function captureLocationOrAbort({ onRetry } = {}) {
  try {
    return await getCurrentGpsPosition({ prompt: true });
  } catch (firstError) {
    if (typeof onRetry !== "function") throw firstError;
    const shouldRetry = await onRetry(firstError);
    if (!shouldRetry) throw firstError;
    return getCurrentGpsPosition({ prompt: true });
  }
}
