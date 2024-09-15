// In a new file, e.g., utils/distance.ts
export const getDistance = (location1: { lat: number; lng: number }, location2: { lat: number; lng: number } | undefined) => {
    if (!location2) return Infinity;
  
    const R = 6371; // Radius of the Earth in km
    const dLat = deg2rad(location2.lat - location1.lat);
    const dLon = deg2rad(location2.lng - location1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(location1.lat)) * Math.cos(deg2rad(location2.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
  };
  
  const deg2rad = (deg: number) => {
    return deg * (Math.PI / 180);
  };