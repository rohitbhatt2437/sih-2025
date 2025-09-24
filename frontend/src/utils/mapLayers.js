// Utilities to add ArcGIS sources/layers to Mapbox GL
import mapboxgl from 'mapbox-gl';

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
  { id, featureServerUrl, where = "1=1", outFields = "*", fit = true }
) {
  const baseParams = {
    where,
    outFields,
    outSR: 4326,
    f: "geojson",
  };

  async function postQuery(params) {
    const resp = await fetch(`${featureServerUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    return resp;
  }

  // First attempt: geoJSON with outSR
  let resp = await postQuery(baseParams);
  // Retry without outSR if server errors (some services choke on reprojection)
  if (!resp.ok && resp.status >= 500) {
    const { outSR, ...noSr } = baseParams;
    resp = await postQuery(noSr);
  }
  if (!resp.ok) throw new Error(`ArcGIS query failed: ${resp.status}`);
  const geojson = await resp.json();

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
      paint: { "fill-color": "#0b5fa5", "fill-opacity": 0.2 },
    });
  }
  if ((types.has("Polygon") || types.has("MultiPolygon")) && !map.getLayer(`${id}-outline`)) {
    map.addLayer({
      id: `${id}-outline`,
      type: "line",
      source: id,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: { "line-color": "#0b5fa5", "line-width": 1.5 },
    });
  }

  // Lines
  if ((types.has("LineString") || types.has("MultiLineString")) && !map.getLayer(`${id}-line`)) {
    map.addLayer({
      id: `${id}-line`,
      type: "line",
      source: id,
      filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      paint: { "line-color": "#0b2962", "line-width": 2 },
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
