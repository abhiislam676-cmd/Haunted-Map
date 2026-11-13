export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Computes great-circle distance between two WGS84 coordinates in kilometers.
 */
export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  if (km < 100) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km).toLocaleString()} km`;
}

export function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

export function getOsmDirectionsUrl(dest: Coordinates, origin?: Coordinates | null): string {
  if (origin) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat}%2C${origin.lng}%3B${dest.lat}%2C${dest.lng}`;
  }
  return `https://www.openstreetmap.org/directions?to=${dest.lat}%2C${dest.lng}`;
}

export function getOsmPinUrl(dest: Coordinates): string {
  return `https://www.openstreetmap.org/?mlat=${dest.lat}&mlon=${dest.lng}#map=15/${dest.lat}/${dest.lng}`;
}

export function formatDuration(seconds: number, lang: 'bn' | 'en' = 'bn'): string {
  const totalMins = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) {
    return lang === 'bn' ? `${totalMins} মিনিট` : `${totalMins} min`;
  }
  if (mins === 0) {
    return lang === 'bn' ? `${hours} ঘণ্টা` : `${hours} hr`;
  }
  return lang === 'bn' ? `${hours} ঘণ্টা ${mins} মিনিট` : `${hours} hr ${mins} min`;
}
