// "Drive there" links for Waze/Google Maps from an event's detail page. Coordinates (when
// available) beat the free-text Location string — same stand-in point as lib/weather.ts uses
// (the mock route's start point), since there's nowhere real coordinates are captured yet.
// Falls back to a text search on Location when there's no route point at all, which still
// works fine in both apps, just less precise.

export function wazeUrl(location: string | null, point: [number, number] | null): string | null {
  if (point) return `https://waze.com/ul?ll=${point[0]},${point[1]}&navigate=yes`;
  if (location) return `https://waze.com/ul?q=${encodeURIComponent(location)}&navigate=yes`;
  return null;
}

export function googleMapsUrl(
  location: string | null,
  point: [number, number] | null,
): string | null {
  const destination = point ? `${point[0]},${point[1]}` : location ? location : null;
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
