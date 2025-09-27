// Utilities to add ArcGIS sources/layers to Mapbox GL
import mapboxgl from 'mapbox-gl';

// Simple in-memory cache for ArcGIS GeoJSON responses
// Keyed by `${featureServerUrl}|${JSON.stringify(params)}`
const _arcgisGeojsonCache = new Map();
const MAX_CACHE = 24; // small LRU-like cap

function _cacheGet(key) {
  if (_arcgisGeojsonCache.has(key)) {
    const val = _arcgisGeojsonCache.get(key);
    // refresh recentness
    _arcgisGeojsonCache.delete(key);
    _arcgisGeojsonCache.set(key, val);
    return val;
  }
  return null;
}
function _cacheSet(key, val) {
  _arcgisGeojsonCache.set(key, val);
  if (_arcgisGeojsonCache.size > MAX_CACHE) {
    // delete oldest
    const firstKey = _arcgisGeojsonCache.keys().next().value;
    _arcgisGeojsonCache.delete(firstKey);
  }
}

// Raster tile layer (for ArcGIS MapServer/TileServer XYZ endpoints)
export function addArcGISTileLayer(map, { id, tiles, tileSize = 256, attribution = "" }) {
  if (!map.getSource(id)) {
    map.addSource(id, {
      type: "raster",
      tiles,
      tileSize,
      attribution,
    });
  }
  if (!map.getLayer(id)) {
    map.addLayer({ id, type: "raster", source: id });
  }
}

// Load ArcGIS FeatureServer as GeoJSON via /query?f=geojson
export async function addArcGISFeatureLayer(
  map,
  {
    id,
    featureServerUrl,
    where = "1=1",
    outFields = "*",
    fit = true,
    labelField = null, // when provided, add a symbol label layer `${id}-label`
    paintOverrides = {}, // e.g., { fill: {...}, outline: {...}, line: {...}, circle: {...}, label: {...} }
  }
) {
  const baseParams = {
    where,
    outFields: outFields || (labelField ? labelField : "*"),
    outSR: 4326,
    returnGeometry: true,
    geometryPrecision: 5, // reduce GeoJSON size for performance
    f: "geojson",
  };

  async function postQuery(params) {
    // Ensure featureServerUrl is a string
    const url = typeof featureServerUrl === 'object' ? featureServerUrl.url : featureServerUrl;
    const resp = await fetch(`${url}/query`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams(params).toString(),
    });
    return resp;
  }

  // First, try cache
  const cacheKey = `${featureServerUrl}|${JSON.stringify(baseParams)}`;
  let geojson = _cacheGet(cacheKey);
  if (!geojson) {
    // First attempt: POST GeoJSON
    let resp = await postQuery(baseParams);
  // Retry without outSR if server errors (some services choke on reprojection)
    if (!resp.ok && resp.status >= 500) {
      const { outSR, ...noSr } = baseParams;
      resp = await postQuery(noSr);
    }
    const ok = resp.ok;
    geojson = ok ? await resp.json() : null;
    // If POST failed or not a FeatureCollection, try GET fallback
    if (!ok || !geojson || geojson.type !== 'FeatureCollection') {
      const params = new URLSearchParams(baseParams).toString();
      const getUrl = `${featureServerUrl}/query?${params}`;
      const getResp = await fetch(getUrl);
      if (!getResp.ok) throw new Error(`ArcGIS query failed: ${getResp.status}`);
      geojson = await getResp.json();
      if (!geojson || geojson.type !== 'FeatureCollection') {
        throw new Error('ArcGIS did not return valid GeoJSON FeatureCollection');
      }
    }
    _cacheSet(cacheKey, geojson);
  }

  if (!map.getSource(id)) {
    map.addSource(id, { type: "geojson", data: geojson });
  } else {
    const src = map.getSource(id);
    src.setData(geojson);
  }

  const types = new Set((geojson.features || []).map((f) => f.geometry && f.geometry.type));

  // Polygons (fill + outline)
  if ((types.has("Polygon") || types.has("MultiPolygon")) && !map.getLayer(`${id}-fill`)) {
    map.addLayer({
      id: `${id}-fill`,
      type: "fill",
      source: id,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: { "fill-color": "#0b5fa5", "fill-opacity": 0.2, ...(paintOverrides.fill || {}) },
    });
  }
  if ((types.has("Polygon") || types.has("MultiPolygon")) && !map.getLayer(`${id}-outline`)) {
    map.addLayer({
      id: `${id}-outline`,
      type: "line",
      source: id,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: { "line-color": "#0b5fa5", "line-width": 1.5, ...(paintOverrides.outline || {}) },
    });
  }

  // Lines
  if ((types.has("LineString") || types.has("MultiLineString")) && !map.getLayer(`${id}-line`)) {
    map.addLayer({
      id: `${id}-line`,
      type: "line",
      source: id,
      filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      paint: { "line-color": "#0b2962", "line-width": 2, ...(paintOverrides.line || {}) },
    });
  }

  // Points
  if ((types.has("Point") || types.has("MultiPoint")) && !map.getLayer(`${id}-circle`)) {
    map.addLayer({
      id: `${id}-circle`,
      type: "circle",
      source: id,
      filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
      paint: {
        "circle-radius": 5,
        "circle-color": "#0b2962",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
        ...(paintOverrides.circle || {}),
      },
    });
  }

  // Optional label layer for polygons/lines/points
  if (labelField && !map.getLayer(`${id}-label`)) {
    map.addLayer({
      id: `${id}-label`,
      type: "symbol",
      source: id,
      layout: {
        "text-field": ["get", labelField],
        "text-size": 11,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#0b2962",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
        ...(paintOverrides.label || {}),
      },
    });
  }

  // Optional: fit bounds to the layer features (supports Points and Polygons)
  if (fit) {
    try {
      const bounds = new mapboxgl.LngLatBounds();
      (geojson.features || []).forEach((f) => {
        const g = f.geometry;
        if (!g) return;
        if (g.type === "Point") {
          bounds.extend(g.coordinates);
        } else if (g.type === "MultiPoint") {
          g.coordinates.forEach((c) => bounds.extend(c));
        } else if (g.type === "Polygon") {
          // coordinates: [ [ring...] , [hole...] ] ; take all rings
          g.coordinates.forEach((ring) => ring.forEach((c) => bounds.extend(c)));
        } else if (g.type === "MultiPolygon") {
          // coordinates: [ [ [ring...] ] ]
          g.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach((c) => bounds.extend(c))));
        }
      });
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 800 });
    } catch (_) {}
  }
}
