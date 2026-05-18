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
        resolve({
          lat: position.coords.latitude.toFixed(6),
          lon: position.coords.longitude.toFixed(6),
        });
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
