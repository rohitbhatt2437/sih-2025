import fetch from 'node-fetch';

export async function geocodeLocation({ address_text, village, district, state, pincode }) {
  const token = process.env.MAPBOX_GEOCODING_TOKEN;
  if (!token) return { lat: null, lon: null, geocode_confidence: null };
  const queryParts = [address_text, village, district, state, pincode, 'India']
    .filter(Boolean)
    .join(', ');
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(queryParts)}.json?access_token=${token}&limit=1&language=en`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Geocoding failed: ${resp.status}`);
    const data = await resp.json();
    const feat = data.features?.[0];
    if (!feat) return { lat: null, lon: null, geocode_confidence: null };
    const [lon, lat] = feat.center || [];
    return { lat, lon, geocode_confidence: feat.relevance ?? null };
  } catch (e) {
    return { lat: null, lon: null, geocode_confidence: null };
  }
}
