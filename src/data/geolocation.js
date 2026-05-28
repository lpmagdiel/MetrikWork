import { writable } from "svelte/store";

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
  unknown: "No se pudo obtener tu ubicación actual.",
};

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

function getGeolocationErrorMessage(error) {
  if (!error) return GEOLOCATION_ERRORS.unknown;

  const messages = {
    1: GEOLOCATION_ERRORS.denied,
    2: GEOLOCATION_ERRORS.unavailable,
    3: GEOLOCATION_ERRORS.timeout,
  };

  return messages[error.code] || error.message || GEOLOCATION_ERRORS.unknown;
}

async function getLocationPermissionState() {
  if (!navigator.permissions?.query) return null;

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    return permission.state;
  } catch (error) {
    return null;
  }
}

export async function getCurrentGpsPosition() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error(GEOLOCATION_ERRORS.unsupported);
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

export async function captureCurrentUserLocation({ silent = true } = {}) {
  try {
    return await getCurrentGpsPosition();
  } catch (error) {
    if (!silent) throw error;
    console.warn("No se pudo capturar la ubicación del usuario:", error?.message || error);
    return null;
  }
}
