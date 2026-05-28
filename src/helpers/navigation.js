/**
 * 
 * @param {number} value
 * @returns 
 */
const toRad = (value) => value * Math.PI / 180;

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