import { get } from "svelte/store";
import { currentUserLocation } from "../data/geolocation.js";

const NOMINATIM_REVERSE_GEOCODE_URL = "https://nominatim.openstreetmap.org/reverse";
const geocodeCache = new Map();

/**
 * 
 * @param {number} value
 * @returns 
 */
const toRad = (value) => value * Math.PI / 180;

export function normalizeCoordinates(value) {
  const lat = Number(value?.lat);
  const lon = Number(value?.lon ?? value?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const coordinates = { lat, lon };

  if (Number.isFinite(Number(value?.accuracy))) {
    coordinates.accuracy = Number(value.accuracy);
  }

  if (value?.updatedAt) {
    coordinates.updatedAt = value.updatedAt;
  }

  return coordinates;
}

export function getStoredUserGpsLocation() {
  return normalizeCoordinates(get(currentUserLocation));
}

export function formatGpsCoordinates(value) {
  const coordinates = normalizeCoordinates(value);
  if (!coordinates) return "";
  return `${coordinates.lat.toFixed(6)}, ${coordinates.lon.toFixed(6)}`;
}

/**
 * 
 * @param {object} location1 { lat: number, lon: number }
 * @param {object} location2 { lat: number, lon: number }
 * @returns 
 */
export function calculateKmDistance(location1, location2) {
  const R = 6371; // Radio de la Tierra en kilómetros

  const dLat = toRad(location2.lat - location1.lat);
  const dLon = toRad(location2.lon - location1.lon);

  const lat1Rad = toRad(location1.lat);
  const lat2Rad = toRad(location2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export const distanceInfo = (location1, location2) => `${calculateKmDistance(location1, location2).toFixed(2)} km`;


export const geocodeAddress = async (gps = null) => {
  try {
    const userLocation = gps === null ? getStoredUserGpsLocation() : normalizeCoordinates(gps);

    if (!userLocation) {
      throw new Error("No hay una ubicación GPS del usuario guardada en la app.");
    }

    const cacheKey = `${userLocation.lat.toFixed(6)},${userLocation.lon.toFixed(6)}`;
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(userLocation.lat),
      lon: String(userLocation.lon),
      zoom: "18",
      addressdetails: "1",
      "accept-language": "es",
    });

    const response = await fetch(`${NOMINATIM_REVERSE_GEOCODE_URL}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("No se pudo obtener la dirección de la ubicación GPS guardada.");
    }

    const result = await response.json();
    const formattedAddress = result?.display_name || result?.name;

    if (!formattedAddress) {
      throw new Error("No se encontraron resultados para la ubicación GPS guardada.");
    }

    geocodeCache.set(cacheKey, formattedAddress);
    return formattedAddress;
  } catch (error) {
    console.error("Error al geocodificar la ubicación GPS guardada:", error);
    throw error;
  }
};
