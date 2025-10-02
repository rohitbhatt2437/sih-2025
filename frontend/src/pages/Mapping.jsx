import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { addArcGISFeatureLayer } from "../utils/mapLayers";

// ArcGIS Service URLs
const STATE_SERVICE = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary/FeatureServer/0';
const DISTRICT_SERVICE = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary/FeatureServer/0';
const VILLAGE_SERVICE = 'https://livingatlas.esri.in/server/rest/services/IAB2024/IAB_Village_2024/MapServer/0';
const MNREGA_SERVICE = 'https://livingatlas.esri.in/server1/rest/services/MGNREGA/IN_DT_FRABeneficiaryDetail/MapServer/0';
const FACILITIES_SERVICE = 'https://livingatlas.esri.in/server1/rest/services/PMGSY/IN_PMGSY_RuralFacilities_2021/MapServer/0';

// Base64 icons for Facilities categories
const ICON_AGRO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAaCAYAAAC+aNwHAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABn0lEQVQ4jbWTsU7DMBRFb1L/RCvmUIkxDHwBU2FC4g/CxJSKtQ0jaiem9g9YCRMLKwMZQW3FCKnEyJ4YXacOaeq6VRFX8uCXvPPs964F/ijxL4B2CD8HfDhoQaKZO3gQEulkiGQjwOuin0v01EYWMVciyItv0WyAvhGwf4WWzDCCRGfteSV6XojObIjDFYDMVFWVfH4UqHWw5+P1I8Hd81ithXwvxGg2xEUJaBd3DnTy9dmoLEoI91/fczy9xToctEOM2RPBnWrYQgSYdHncqwJ0TqKvcFKtaJIhzpzxyhR4ZxOE8ZrSsgcAYt1ANqvaA63bx2g54GBeAlwg4Zw1gA3jnfUUmFy9v8qRqigUgN30QuUydXb+XE+oKdGuFOWJGjiVGT5tWWV1FB5YAkxvkHoh6BbzHH+l5r8CoJwGIplZAXMXqgiMgClP0UVEz68BxPUXKep/8LXxweiGVpRo/1sBVO4gciXuUYvBIGEKvg8QV8fK6oxtDdCjyoEXW3UrYFKYi3ZN11W3AlDIaseNAPrCydDcGUBf6Ge7E2Ab/QCO5aTjhmlSiAAAAABJRU5ErkJggg==';
const ICON_EDU  = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAACXBIWXMAAA7EAAAOxAGVKw4bAAADI0lEQVRIic2WPWgTYRjHn0sj5rBCr3S5GwRbKpZmaS8OgsnoUGohg/0EF2m7Ck66qFM3ca3FRZC0hVLQ2sEOQuskSQXNtdWQBIfeVYjJ0NILYnLyf9s77zMGW8Q/HOE+8v7u+Xj/z4XpHyr8X8JSqZRkhM7IIY4TDaMu4VqdM16FajVtbGxMPRXY/OLSFBk0FeHPyoIgEB+JEM/z7J6qag/KlQrNLyxlalxtemJ4OPNXsBeLi3Kozj0U2toGo709JEmi5xlch/KFopxVttKAGvUfQ0GRhoNALUbLbG+0RzYXbKSuzovsyCrb8idlK51KpWJ+wHAQKH7tquwXzeZynj4s56kv2UX9yS5PpDwfEd+nN32BHhhSh4jcIBOi7VTYuTaTZueJySh1xyVHlLpeFbNZZZaIbgTC0AxmjUxh8fW5LOU2vGXAvYW7GyReFmjg/hX2a0aoqtogsmRvGmdkBk2ZoEYQP+izW28YbORxnFo7eIrF+mht7S2ii3lg2Edob3v6tO2jlDWr/VKV/ac7zlO7IJBBhox1zdpZMGxY7CNTeMs7q0OsVutzCh2U9ECIeJw+yF4/vPiuqsnYkg4YnAEb1i10HA4/KNJ1KS7RwL2Y1UB2YT2sa57/jsyoS6YzuIWFxJ52K9LVmTR7gcRkL0tbLqCuWM+0NgeskQ5KVUcD9CdHWFO8nkkzUGIySq0d3qy4ZcFgqvC6Ro4BwJOBl1Za/yRV1di6HhjcG6bajJoBQXrV2VQWDO0JI4WpwgXs6k92Um5j13IPu5Ba3P/iqlu+UCT9UF+ZGA3Y1BgTcG83DF13+/l1Vp/9kk57OxV2DSB7qztg+SIZHPfUNzII1oLo4N5+tQtaGDrfcdTJiP57bY/K5fLK+OhNq16+3Yh5hDEB93ZH2EjdcYly71T6/LFA3+hrhoyf0+5nPDDUDuMBYwLu3cw8M3Vh6BwpynamTsaj8WbmmR2IMQH3hqnC64KULxRZjZA6ROQHCoSZQMwjjAm4N0wVXuf6BmHtrR/qK2gGd42ahpk6nkcxuDdM1f11xZ6xtfeJYK5Im/pkOzHsNPQLQ2+xLqIkHqIAAAAASUVORK5CYII=';
const ICON_MED  = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAYAAACN1PRVAAAACXBIWXMAAA7EAAAOxAGVKw4bAAADPUlEQVRIic2Wy08TURTGz5SCHd10DJi0bEATkko3ZLoxEf6CwkIj4eG63brXBEh0z7asNcUmsLDdGBYmuDOtLpyhiUmpm84kYAobGQK2Y75b7uTOi1Qhxi8hYR49v3vOPee7E6V/qOh/CSsWi0k7MqhGJClh290k7nUluxzpdMzFxUXjWmCbpa0c2ZSLyTdURVFIjsVIlmX2zDDMlfbREW2+3ap1pE5+eX6+9lewN6WSGulKq0o8nk1PpiiZTPjewX2osd9UNX2vCqjdPZsLyzQaBhqwBwqT6ZTKA16me3fH2Z+m19Wv+l61WCxmgoDRMND0wwdqUDaXKT2ZIlmOJT5VPwcCfTCUDhn9KYgLGVrWaULT9AIRzYbC0Ax8j7jOD006+limk70a3byv0p1HOefZwfYGux+fmaX4TNa5j98bhplFlcSmcWdmU04E/azXqFVYo+Pdcu/GNtHxboXGnxeo+Srv3D/Y3qDBkSSlX1dpcKRXkUxminZ2PiC7jA+GOUJ7i+UDzAFdCNdavUZDw+4ynx8arAI889uKQjbZKuLyvXNgGFjMkajDrQ0K09iLgpP1rZTqvC+WGQtvGSYeumFwBgysKAQ5+2G6Vg8p01kaGk6ycn7ZLdPI4xwp07OstKIQD3F9ZYQFcWcQVz8mXOvLGVZaBEfg0fwKTayXWXOgkSbW37lhsszi+mBBQgDtaW9/UR4EbhVW2TXKB/DU+xZrEJQQz3mDBMmBwVThdWI34odY/feXeQZBBsgW17ysfN9G86s+kGGYLK4PBveGqXqFjDBLWD0ggOF/rt4i3HPGZZ1awZmhPWGkMFW4gCgAIEC+PZvzLWbs4rmoxn6TrBOrsrwQMtQ4JuDeXhgHwkF4CTHEKLHY6i5Yo0m2JLlmxwWDtSA7uHeQ2yMwxgH7BBCfL680vU7tdruytPDE5Qi+bsR5hGMC7h2UIQDeFvc2ha7Xa2T/cg9dEAx7h+MBxwTcu5/zTMwIoC7Za0v9nGciEMcE3BumCq8LU2O/yfYIpUNGQaBQGAfiPMIxAfeGqcLrPN8grL2tE6uCZvDuUd8wrovzKAP3hql6v67YO0J7XwnmybSvT7Yrw65DvwFJ/sOpPHBHjgAAAABJRU5ErkJggg==';
const ICON_TRN  = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAaCAYAAACHD21cAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABCUlEQVQ4jeXTv22DQBTH8e8BGQIkpjg3mcAbeATSRFYygeUJLLmDNUiTCdKEMhO4SJ8+ftE7wl8fxrKSyj/pCqT3ueM9uIgrE/0dfJSEOyyCBWKOFOxNNQ3XYgnJHZBeRUDGk4Ch4puHZpOoRQElQqyP2X29bArVAYo3t+oaSDoYulNalK+6AxXnKXx+QflBzLNk7ExRQ6l3aaAvm6WD/Pbe9hj3T/DFpjNT1Z58uDrMQB2E9jTO9vUCqIPYLLupKnL9nYMaLSpHhf/4y12Y6GbgkcJdn7kY9Eq9dFDv2FoWBLzPoC07Uw5f9Rw2QzSEU9icolM4xhPID/s4JPGhadhg3IneXP0dfwCUi2FilejuzAAAAABJRU5ErkJggg==';

// State codes mapping
const STATE_CODE = {
  'Odisha': 'OD',
  'Madhya Pradesh': 'MP',
  'Tripura': 'TR',
  'Telangana': 'TG'
};

export default function Mapping() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [error, setError] = useState(null);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedVillage, setSelectedVillage] = useState("");
  const [showDistricts, setShowDistricts] = useState(false);
  const [showMNREGA, setShowMNREGA] = useState(false);
  const [showFacilities, setShowFacilities] = useState(false);
  const [showSentinel, setShowSentinel] = useState(false);
  // MNREGA service schema cache
  const [mnregaFields, setMnregaFields] = useState(null);
  // State for districts and villages dropdowns
  const [districts, setDistricts] = useState([]);
  const [villages, setVillages] = useState([]);
  const [clickedInfo, setClickedInfo] = useState(null);
  // Cache latest selected boundary geometry for Sentinel mask
  const sentinelMaskGeomRef = useRef(null);
  
  // Helper function to remove layer and source
  const removeLayerAndSource = (id) => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  };

  // Helper to add Sentinel LULC as raster tiles from ArcGIS MapServer
  const addSentinelLayer = (map) => {
    // Do not add if toggle is off by the time this runs
    if (!showSentinel) return;
    const sourceId = 'sentinel-lulc';
    const layerId = 'sentinel-lulc-layer';
    // Use export endpoint with bbox templating to avoid 404s on tile endpoint
    const tilesUrl = 'https://livingatlas.esri.in/server/rest/services/Sentinel_Lulc/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image';
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [tilesUrl],
        tileSize: 256,
        attribution: '© Esri Living Atlas India'
      });
    }
    if (!map.getLayer(layerId)) {
      const style = map.getStyle();
      let beforeId;
      if (style && Array.isArray(style.layers)) {
        // Prefer a common label layer if present
        const preferred = ['waterway-label','settlement-label','place-label'];
        beforeId = preferred.find(id => style.layers.some(l => l.id === id));
        if (!beforeId) {
          // Fallback: first symbol layer to keep raster below labels
          const sym = style.layers.find(l => l.type === 'symbol');
          beforeId = sym ? sym.id : undefined;
        }
      }
      const layerDef = {
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': 0.95,
          'raster-fade-duration': 0
        }
      };
      try {
        if (beforeId) map.addLayer(layerDef, beforeId); else map.addLayer(layerDef);
      } catch (e) {
        // Last resort, add without beforeId
        try { map.addLayer(layerDef); } catch (_) {}
      }
    }
  };

  const removeSentinelLayer = (map) => {
    const sourceId = 'sentinel-lulc';
    const layerId = 'sentinel-lulc-layer';
    if (map.getLayer(layerId)) {
      try { map.removeLayer(layerId); } catch (_) {}
    }
    if (map.getSource(sourceId)) {
      try { map.removeSource(sourceId); } catch (_) {}
    }
  };

  // Build a mask that dims everything outside the selected polygon
  const SENTINEL_MASK_SOURCE = 'sentinel-mask-src';
  const SENTINEL_MASK_LAYER = 'sentinel-mask-layer';
  const removeSentinelMask = (map) => {
    if (map.getLayer(SENTINEL_MASK_LAYER)) {
      try { map.removeLayer(SENTINEL_MASK_LAYER); } catch (_) {}
    }
    if (map.getSource(SENTINEL_MASK_SOURCE)) {
      try { map.removeSource(SENTINEL_MASK_SOURCE); } catch (_) {}
    }
  };

  const addSentinelMask = (map, geom) => {
    if (!geom) return;
    // World polygon slightly inside mercator bounds to avoid artifacts
    let outer = [
      [-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]
    ];

    // Normalize geometry to list of polygons (rings)
    const polygons = [];
    if (geom.type === 'Polygon') {
      polygons.push(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      for (const p of geom.coordinates) polygons.push(p);
    } else {
      return;
    }

    // Use first ring of each polygon as a hole (inner ring). We don't preserve internal holes.
    let holes = polygons.map(rings => rings[0]).filter(Boolean);

    // Ensure correct winding per RFC 7946: outer CCW, holes CW
    const ringArea = (ring) => {
      let sum = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        sum += (x2 - x1) * (y2 + y1);
      }
      return sum; // negative ~= CCW, positive ~= CW (approx in lon/lat)
    };
    const isCCW = (ring) => ringArea(ring) < 0;
    // Outer should be CCW
    if (!isCCW(outer)) outer = [...outer].reverse();
    // Holes should be CW
    holes = holes.map(h => (isCCW(h) ? [...h].reverse() : h));
    const maskFeature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [outer, ...holes] }
    };

    if (!map.getSource(SENTINEL_MASK_SOURCE)) {
      map.addSource(SENTINEL_MASK_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [maskFeature] } });
    } else {
      const src = map.getSource(SENTINEL_MASK_SOURCE);
      if (src && src.setData) src.setData({ type: 'FeatureCollection', features: [maskFeature] });
    }
    if (!map.getLayer(SENTINEL_MASK_LAYER)) {
      map.addLayer({
        id: SENTINEL_MASK_LAYER,
        type: 'fill',
        source: SENTINEL_MASK_SOURCE,
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': 1.0
        }
      });
    }
  };

  // Update Sentinel mask from whichever selection is available
  const updateSentinelMask = async () => {
    const map = mapRef.current;
    if (!map || !showSentinel) return;
    try {
      // Use cached geometry if available; otherwise try to (re)draw and cache
      let geom = sentinelMaskGeomRef.current || null;
      if (!geom) {
        if (selectedState && selectedDistrict && selectedVillage) {
          await showVillageBoundary(selectedState, selectedDistrict, selectedVillage);
        } else if (selectedState && selectedDistrict) {
          await showDistrictBoundary(selectedState, selectedDistrict);
        } else if (selectedState) {
          await showStateBoundary(selectedState);
          // Fallback: if state boundary failed, build from all districts of the state
          if (!sentinelMaskGeomRef.current) {
            try {
              const code = STATE_CODE[selectedState];
              if (code) {
                // Robustly fetch all districts with paging
                const polys = [];
                let resultOffset = 0;
                const pageSize = 2000;
                for (let guard = 0; guard < 50; guard++) {
                  const params = new URLSearchParams({
                    where: `state='${code}'`,
                    outFields: '*',
                    returnGeometry: 'true',
                    f: 'geojson',
                    resultOffset: String(resultOffset),
                    resultRecordCount: String(pageSize)
                  });
                  const url = `${DISTRICT_SERVICE}/query?${params.toString()}`;
                  const resp = await fetch(url);
                  const data = await resp.json();
                  const feats = Array.isArray(data?.features) ? data.features : [];
                  for (const f of feats) {
                    const g = f?.geometry;
                    if (!g) continue;
                    if (g.type === 'Polygon') polys.push(g.coordinates);
                    else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
                  }
                  if (data?.exceededTransferLimit && feats.length > 0) {
                    resultOffset += feats.length;
                  } else {
                    break;
                  }
                }
                if (polys.length) {
                  geom = { type: 'MultiPolygon', coordinates: polys };
                  sentinelMaskGeomRef.current = geom;
                }
              }
            } catch (_) { /* ignore */ }
          }
        }
        geom = sentinelMaskGeomRef.current || null;
      }
      removeSentinelMask(map);
      if (geom) {
        // Ensure raster exists then apply mask
        addSentinelLayer(map);
        addSentinelMask(map, geom);
      } else {
        // No geometry -> hide raster to avoid global overlay
        removeSentinelLayer(map);
      }
    } catch (e) {
      // Non-fatal: just skip mask
      removeSentinelMask(map);
    }
  };

  // Build Facilities WHERE using provided names (used as click fallback)
  const buildFacilitiesWhereFor = async (stateName, districtName, villageName) => {
    const fields = await ensureFacilitiesFields();
    if (!fields || fields.length === 0) return null;
    const stateField = pickField(fields, [
      'state_name','STATE_NAME','State','STATE','ST_NM','STNAME','STATEUT','State_Name'
    ]);
    const districtField = pickField(fields, [
      'district_name','DISTRICT_NAME','District','DISTRICT','District_Name','DIST_NAME','DTNAME'
    ]);
    const villageField = pickField(fields, [
      'village','VILLAGE','Village','VILLAGE_NAME','Name','NAME','VILL_NAME'
    ]);
    const clauses = [];
    if (stateName && stateField) clauses.push(`UPPER(${stateField})=UPPER('${esc(stateName)}')`);
    if (districtName && districtField) clauses.push(`UPPER(${districtField})=UPPER('${esc(districtName)}')`);
    if (villageName && villageField) clauses.push(`UPPER(${villageField})=UPPER('${esc(villageName)}')`);
    if (clauses.length === 0) return null;
    return clauses.join(' AND ');
  };

  // Query facilities counts grouped by facilitycat
  const queryFacilitiesCounts = async (where) => {
    const stats = JSON.stringify([
      { statisticType: 'count', onStatisticField: 'facilitycat', outStatisticFieldName: 'cnt' }
    ]);
    const params = new URLSearchParams({
      where: where || '1=1',
      groupByFieldsForStatistics: 'facilitycat',
      outStatistics: stats,
      returnGeometry: 'false',
      f: 'json'
    });
    const resp = await fetch(`${FACILITIES_SERVICE}/query?${params.toString()}`);
    const data = await resp.json();
    const feats = Array.isArray(data?.features) ? data.features : [];
    const res = { agro: 0, education: 0, medical: 0, transportAdmin: 0 };
    for (const f of feats) {
      const attrs = f?.attributes || {};
      const cat = String(attrs.facilitycat ?? attrs.FACILITYCAT ?? '').toLowerCase();
      const cnt = Number(attrs.cnt ?? 0) || 0;
      if (cat.includes('agro')) res.agro += cnt;
      else if (cat.includes('education') || cat.includes('school')) res.education += cnt;
      else if (cat.includes('medical') || cat.includes('health') || cat.includes('hospital')) res.medical += cnt;
      else if (cat.includes('transport') || cat.includes('admin')) res.transportAdmin += cnt;
    }
    return res;
  };

  // Resolve Facilities service fields and build WHERE clause like MNREGA
  const [facilitiesFields, setFacilitiesFields] = useState(null);
  const ensureFacilitiesFields = async () => {
    if (facilitiesFields) return facilitiesFields;
    try {
      const resp = await fetch(`${FACILITIES_SERVICE}?f=json`);
      const data = await resp.json();
      const fields = Array.isArray(data?.fields) ? data.fields : [];
      setFacilitiesFields(fields);
      return fields;
    } catch (e) {
      console.warn('Failed to fetch Facilities fields', e);
      return [];
    }
  };

  const buildFacilitiesWhere = async () => {
    const fields = await ensureFacilitiesFields();
    if (!fields || fields.length === 0) return null;

    // Try common candidates; service appears to use 'state_name', 'district_name'
    const stateField = pickField(fields, [
      'state_name','STATE_NAME','State','STATE','ST_NM','STNAME','STATEUT','State_Name'
    ]);
    const districtField = pickField(fields, [
      'district_name','DISTRICT_NAME','District','DISTRICT','District_Name','DIST_NAME','DTNAME'
    ]);
    const villageField = pickField(fields, [
      'village','VILLAGE','Village','VILLAGE_NAME','Name','NAME','VILL_NAME'
    ]);

    const clauses = [];
    if (selectedState && stateField) {
      clauses.push(`UPPER(${stateField})=UPPER('${esc(selectedState)}')`);
    }
    if (selectedDistrict && districtField) {
      clauses.push(`UPPER(${districtField})=UPPER('${esc(selectedDistrict)}')`);
    }
    if (selectedVillage && villageField) {
      clauses.push(`UPPER(${villageField})=UPPER('${esc(selectedVillage)}')`);
    }
    if (clauses.length === 0) return null;
    return clauses.join(' AND ');
  };

  // Normalize a state identifier to friendly name keys used in STATE_CODE and waterBodySources
  const normalizeStateName = (val) => {
    if (!val) return null;
    const name = String(val).trim();
    // If already a friendly name
    if (Object.prototype.hasOwnProperty.call(STATE_CODE, name)) return name;
    // If it's a code, map back to name (TS/TG both -> Telangana)
    const code = name.toUpperCase();
    if (code === 'TS' || code === 'TG') return 'Telangana';
    const entry = Object.entries(STATE_CODE).find(([, c]) => String(c).toUpperCase() === code);
    return entry ? entry[0] : null;
  };

  // Helpers to resolve State/District by point
  const extractFirst = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
  const attrPick = (attrs, candidates) => {
    if (!attrs) return null;
    const keys = Object.keys(attrs);
    // direct exact
    for (const c of candidates) {
      if (c in attrs) return attrs[c];
    }
    // case-insensitive
    const lowerMap = new Map(keys.map(k => [k.toLowerCase(), k]));
    for (const c of candidates) {
      const key = lowerMap.get(c.toLowerCase());
      if (key) return attrs[key];
    }
    return null;
  };

  const getStateDistrictAtPoint = async (lng, lat) => {
    try {
      const geo = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
      const common = `geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&outFields=*&f=json`;
      const [sRes, dRes] = await Promise.all([
        fetch(`${STATE_SERVICE}/query?geometry=${geo}&${common}`),
        fetch(`${DISTRICT_SERVICE}/query?geometry=${geo}&${common}`),
      ]);
      const [sJson, dJson] = await Promise.all([sRes.json(), dRes.json()]);
      const sFeat = extractFirst(sJson?.features);
      const dFeat = extractFirst(dJson?.features);
      const sAttrs = sFeat?.attributes || {};
      const dAttrs = dFeat?.attributes || {};

      const stateName = attrPick(sAttrs, ['State_FSI','STATE_NAME','State_Name','STNAME','ST_NM','STATEUT','STATE','State']);
      const districtName = attrPick(dAttrs, ['district','District','DISTRICT','DISTRICT_NAME','District_Name','DIST_NAME']);
      return {
        stateName: stateName || null,
        districtName: districtName || null,
      };
    } catch (e) {
      console.error('Failed resolving state/district at point:', e);
      return { stateName: null, districtName: null };
    }
  };

  // Handle map click -> show info panel
  const onMapClick = async (e) => {
    const map = mapRef.current;
    if (!map) return;
    const { lng, lat } = e.lngLat;
    const base = await getStateDistrictAtPoint(lng, lat);

    const info = { ...base, mnrega: null, water: null, facilities: null, lng, lat };

    // Facilities counts by selected geography (only when Facilities is toggled on)
    if (showFacilitiesRef.current) {
      try {
        let where = await buildFacilitiesWhere();
        // Fallback to names resolved at click if no UI selection yet
        if (!where) {
          where = await buildFacilitiesWhereFor(base.stateName, base.districtName, selectedVillageRef.current || null);
        }
        const counts = await queryFacilitiesCounts(where);
        if (counts) {
          info.facilities = counts;
        }
      } catch (e) {
        console.error('Facilities counts query failed:', e);
      }
    }

    // Water bodies count by state/district/village IF Water Bodies is toggled on
    if (visibleGroupsRef.current.has('arcgis-features')) {
      try {
        const friendlyState = normalizeStateName(base.stateName);
        if (friendlyState) {
          const waterCount = await queryWaterBodiesCount(friendlyState, base.districtName, selectedVillageRef.current || null);
          if (typeof waterCount === 'number') {
            info.water = { count: waterCount };
          }
        }
      } catch (err) {
        console.error('Water bodies count query failed:', err);
      }
    }
    if (showMNREGARef.current) {
      // Preferred: query MNREGA by district/state, not by point
      try {
        const whereByNames = await buildMNREGAWhereFor(base.stateName, base.districtName, null);
        if (whereByNames) {
          const params = new URLSearchParams({
            where: whereByNames,
            outFields: 'tot_fra_beneficiaries_regis,no_fra_beneficiaries_having',
            returnGeometry: 'false',
            f: 'json',
          });
          const resp = await fetch(`${MNREGA_SERVICE}/query?${params.toString()}`);
          const data = await resp.json();
          const feat = Array.isArray(data?.features) && data.features.length ? data.features[0] : null;
          const attrs = feat?.attributes || {};
          const lowerMap = new Map(Object.keys(attrs).map(k => [k.toLowerCase(), k]));
          const totKey = lowerMap.get('tot_fra_beneficiaries_regis');
          const haveKey = lowerMap.get('no_fra_beneficiaries_having');
          const tot = totKey ? attrs[totKey] : undefined;
          const have = haveKey ? attrs[haveKey] : undefined;
          if (tot !== undefined || have !== undefined) {
            info.mnrega = {
              tot_fra_beneficiaries_regis: tot,
              no_fra_beneficiaries_having: have,
            };
          }
        }
      } catch (e) {
        console.error('MNREGA district-based query failed:', e);
      }

      try {
        // check rendered features for MNREGA around click
        const pad = 10; // pixels, larger tolerance
        const bbox = [
          { x: e.point.x - pad, y: e.point.y - pad },
          { x: e.point.x + pad, y: e.point.y + pad },
        ];
        const layers = ['mnrega','mnrega-circle','mnrega-line','mnrega-fill','mnrega-outline'];
        const feats = map.queryRenderedFeatures(bbox, { layers });
        const feat = feats && feats.length ? feats[0] : null;
        const props = feat?.properties || {};
        // try exact + case-insensitive
        const getProp = (name) => {
          if (name in props) return props[name];
          const lowerMap = new Map(Object.keys(props).map(k => [k.toLowerCase(), k]));
          const key = lowerMap.get(name.toLowerCase());
          return key ? props[key] : undefined;
        };
        const tot = getProp('tot_fra_beneficiaries_regis');
        const have = getProp('no_fra_beneficiaries_having');
        if (tot !== undefined || have !== undefined) {
          info.mnrega = {
            tot_fra_beneficiaries_regis: tot,
            no_fra_beneficiaries_having: have,
          };
        }
      } catch (err) {
        console.error('MNREGA click feature lookup failed:', err);
      }

      // Fallback: query MNREGA service near clicked location if nothing picked from rendered layers
      if (!info.mnrega) {
        try {
          // Build a tiny bbox (envelope) around the click in map coords for robust intersect
          const padPx = 10;
          const pMin = { x: e.point.x - padPx, y: e.point.y - padPx };
          const pMax = { x: e.point.x + padPx, y: e.point.y + padPx };
          const llMin = map.unproject(pMin);
          const llMax = map.unproject(pMax);
          const envelope = {
            xmin: Math.min(llMin.lng, llMax.lng),
            ymin: Math.min(llMin.lat, llMax.lat),
            xmax: Math.max(llMin.lng, llMax.lng),
            ymax: Math.max(llMin.lat, llMax.lat),
            spatialReference: { wkid: 4326 }
          };
          const geometry = encodeURIComponent(JSON.stringify(envelope));

          // Use same WHERE filter as layer (if any)
          const where = await buildMNREGAWhere();
          const search = new URLSearchParams({
            geometry,
            geometryType: 'esriGeometryEnvelope',
            inSR: '4326',
            spatialRel: 'esriSpatialRelIntersects',
            returnGeometry: 'false',
            outFields: '*',
            f: 'json',
          });
          if (where) search.set('where', where);

          const resp = await fetch(`${MNREGA_SERVICE}/query?${search.toString()}`);
          const data = await resp.json();
          const feat = Array.isArray(data?.features) && data.features.length ? data.features[0] : null;
          const attrs = feat?.attributes || {};
          const lowerMap = new Map(Object.keys(attrs).map(k => [k.toLowerCase(), k]));
          const totKey = lowerMap.get('tot_fra_beneficiaries_regis');
          const haveKey = lowerMap.get('no_fra_beneficiaries_having');
          const tot = totKey ? attrs[totKey] : undefined;
          const have = haveKey ? attrs[haveKey] : undefined;
          if (tot !== undefined || have !== undefined) {
            info.mnrega = {
              tot_fra_beneficiaries_regis: tot,
              no_fra_beneficiaries_having: have,
            };
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.debug('MNREGA attributes available but expected keys missing. Keys:', Object.keys(attrs));
            }
          }
        } catch (e2) {
          console.error('MNREGA point query failed:', e2);
        }
      }
    }
    setClickedInfo(info);
  };

  // Build WHERE for water bodies per provided names
  const buildWaterWhereFor = (stateName, districtName, villageName) => {
    if (!stateName) return null;
    const code = STATE_CODE[stateName];
    if (!code) return null;
    // Handle Telangana dual codes (TS/TG)
    let stateClause;
    if (stateName === 'Telangana') {
      stateClause = `state IN ('TS','TG')`;
    } else {
      stateClause = `state='${String(code).replace(/'/g, "''")}'`;
    }
    const parts = [stateClause];
    if (districtName) parts.push(`UPPER(district)=UPPER('${String(districtName).replace(/'/g, "''")}')`);
    if (villageName) parts.push(`UPPER(village)=UPPER('${String(villageName).replace(/'/g, "''")}')`);
    return parts.join(' AND ');
  };

  // Query water bodies count efficiently using returnCountOnly
  const queryWaterBodiesCount = async (stateName, districtName, villageName) => {
    const svc = waterBodySources[stateName]?.url;
    if (!svc) return null;
    const where = buildWaterWhereFor(stateName, districtName, villageName) || '1=1';
    const params = new URLSearchParams({ where, returnCountOnly: 'true', f: 'json' });
    const resp = await fetch(`${svc}/query?${params.toString()}`);
    const data = await resp.json();
    const count = typeof data?.count === 'number' ? data.count : null;
    if (count === null && process.env.NODE_ENV !== 'production') {
      console.debug('Water bodies count returned null', { where, svc, data });
    }
    return count;
  };

  // Minimal helper to highlight selected district boundary
  const showDistrictBoundary = async (stateName, districtName) => {
    const map = mapRef.current;
    if (!map || !stateName || !districtName) return;
    const stateCode = STATE_CODE[stateName];
    if (!stateCode) return;
    try {
      const where = (stateName === 'Telangana'
        ? "state IN ('TS','TG')"
        : `state='${stateCode}'`) +
        ` AND UPPER(district)='${String(districtName).toUpperCase().replace(/'/g, "''")}'`;
      const url = `${DISTRICT_SERVICE}/query?where=${encodeURIComponent(where)}&outFields=*&f=geojson`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data || !data.features || data.features.length === 0) {
        console.warn('No district features found for WHERE:', where);
        return;
      }
      // Refresh highlight source/layer
      removeLayerAndSource('district-boundary-highlight');
      map.addSource('district-boundary-highlight', { type: 'geojson', data });
      map.addLayer({
        id: 'district-boundary-highlight',
        type: 'line',
        source: 'district-boundary-highlight',
        paint: {
          'line-color': '#ff0000',
          'line-width': 3
        }
      });
      // Cache geometry for Sentinel mask
      try { sentinelMaskGeomRef.current = (data.features?.[0]?.geometry) || null; } catch (_) { sentinelMaskGeomRef.current = null; }
    } catch (e) {
      console.error('Failed to show district boundary:', e);
    }
  };

  // Helper to remove a layer group that may have sublayers created by addArcGISFeatureLayer
  const removeLayerGroup = (baseId) => {
    const map = mapRef.current;
    if (!map) return;
    const subs = ["-fill", "-outline", "-line", "-circle", "-label"]; 
    subs.forEach((s) => {
      const id = `${baseId}${s}`;
      if (map.getLayer(id)) {
        try { map.removeLayer(id); } catch (_) {}
      }
    });
    if (map.getLayer(baseId)) {
      try { map.removeLayer(baseId); } catch (_) {}
    }
    if (map.getSource(baseId)) {
      try { map.removeSource(baseId); } catch (_) {}
    }
  };

  // Function to highlight state boundary
  const showStateBoundary = async (stateName) => {
    console.log('Showing state boundary for:', stateName);
    const map = mapRef.current;
    if (!map) {
      console.error('Map not initialized');
      return;
    }

    const stateCode = STATE_CODE[stateName];
    if (!stateCode) {
      console.error('Invalid state name:', stateName);
      return;
    }

    const whereByCode = stateName === 'Telangana'
      ? `State_Name IN ('TS','TG')`
      : `State_Name='${stateCode}'`;
    const whereByName = `State_FSI='${stateName.replace(/'/g, "''")}'`;
    const urlByCode = `${STATE_SERVICE}/query?where=${encodeURIComponent(whereByCode)}&outFields=*&f=geojson`;
    const urlByName = `${STATE_SERVICE}/query?where=${encodeURIComponent(whereByName)}&outFields=*&f=geojson`;

    try {
      let response = await fetch(urlByCode);
      let data = await response.json();
      
      if (!data || !data.features || data.features.length === 0) {
        response = await fetch(urlByName);
        data = await response.json();
      }

      if (!data || !data.features || data.features.length === 0) {
        throw new Error('No state features found');
      }

      removeLayerAndSource('state-boundary-highlight');
      map.addSource('state-boundary-highlight', { type: 'geojson', data });
      map.addLayer({
        id: 'state-boundary-highlight',
        type: 'line',
        source: 'state-boundary-highlight',
        paint: {
          'line-color': '#0000ff',
          'line-width': 3
        }
      });

      // Fit to state bounds
      const bounds = data.features[0].geometry.coordinates[0].reduce((bounds, coord) => {
        return [
          [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
          [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
        ];
      }, [[180, 90], [-180, -90]]);

      map.fitBounds(bounds, { padding: 50, duration: 1000 });
      // Cache geometry for Sentinel mask
      try { sentinelMaskGeomRef.current = (data.features?.[0]?.geometry) || null; } catch (_) { sentinelMaskGeomRef.current = null; }
    } catch (error) {
      console.error('Error highlighting state:', error);
    }
  };

  // Load water bodies for the selected area (state/district/village)
  const loadWaterBodies = async (stateName, districtName, villageName) => {
    const map = mapRef.current;
    if (!map) return;

    // Wait for map style to be loaded
    if (!map.isStyleLoaded()) {
      await new Promise(resolve => map.once('style.load', resolve));
    }

    const stateCode = STATE_CODE[stateName];
    if (!stateCode) {
      console.error('Invalid state name:', stateName);
      return;
    }

    // Get the water bodies service URL for the selected state
    const waterServiceUrl = waterBodySources[stateName]?.url;
    if (!waterServiceUrl) {
      console.error('No water bodies service available for state:', stateName);
      return;
    }

    try {
      // Build WHERE with TS/TG handling via helper
      const where = buildWaterWhereFor(stateName, districtName, villageName) || `state='${stateCode}'`;

      // Remove existing layers first (ensure sublayers removed before source)
      removeWaterBodiesLayer();

      const params = new URLSearchParams({
        where,
        outFields: '*',
        f: 'geojson'
      });

      const response = await fetch(`${waterServiceUrl}/query?${params}`);
      const data = await response.json();

      if (!data?.features) {
        throw new Error('No features returned from water bodies service');
      }

      // Add water bodies to map
      map.addSource('arcgis-features', {
        type: 'geojson',
        data
      });

      // Add fill layer
      map.addLayer({
        id: 'arcgis-features-fill',
        type: 'fill',
        source: 'arcgis-features',
        paint: {
          'fill-color': '#1976d2',
          'fill-opacity': 0.55
        }
      });

      // Add outline layer
      map.addLayer({
        id: 'arcgis-features-outline',
        type: 'line',
        source: 'arcgis-features',
        paint: {
          'line-color': '#1976d2',
          'line-width': 1
        }
      });

      return data;
    } catch (error) {
      console.error('Error loading water bodies:', error);
      removeLayerAndSource('arcgis-features');
      return null;
    }
  };  // Function to load villages for a district
  const loadVillagesForDistrict = async (stateName, districtName) => {
    console.log('Loading villages for:', stateName, districtName); // Debug log
    if (!stateName || !districtName) {
      setVillages([]);
      return;
    }

    try {
      // Case-insensitive WHERE clause (handle Telangana TS/TG codes)
      const stateWhere = stateName === 'Telangana'
        ? `(UPPER(State)=UPPER('Telangana') OR UPPER(State) IN ('TS','TG'))`
        : `UPPER(State)=UPPER('${stateName}')`;
      const where = [
        stateWhere,
        `UPPER(District)=UPPER('${districtName}')`
      ].join(' AND ');

      // Use statistics + groupBy for true distincts
      const stats = JSON.stringify([
        { statisticType: 'count', onStatisticField: 'Name', outStatisticFieldName: 'cnt' }
      ]);

      const pageSize = 2000;
      let resultOffset = 0;
      let villages = new Set();

      while (true) {
        const params = new URLSearchParams({
          where,
          outFields: 'Name',
          groupByFieldsForStatistics: 'Name',
          outStatistics: stats,
          orderByFields: 'Name',
          returnGeometry: 'false',
          f: 'json',
          resultOffset: String(resultOffset),
          resultRecordCount: String(pageSize)
        });

        const url = `${VILLAGE_SERVICE}/query?${params}`;
        console.log('Fetching villages URL:', url); // Debug log

        const response = await fetch(url);
        const data = await response.json();

        console.log('Village data received:', data); // Debug log

        if (data.error) {
          throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`);
        }

        if (!data || !Array.isArray(data.features)) {
          console.log('No valid features returned:', data);
          return;
        }

        data.features.forEach(feature => {
          if (feature && feature.attributes) {
            const name = feature.attributes.Name || feature.attributes.name;
            if (name && typeof name === 'string') {
              villages.add(name.trim());
            }
          }
        });

        // If server signals more data, continue paging
        if (data.exceededTransferLimit && data.features.length > 0) {
          resultOffset += data.features.length;
        } else {
          break;
        }
      }

      const villageList = [...villages].sort((a, b) => a.localeCompare(b));
      console.log('Final village list:', villageList); // Debug log
      setVillages(villageList);

    } catch (error) {
      console.error('Failed to load villages:', error);
      setVillages([]);
    }
  };

  // (Removed) effect and UI for state boundaries visibility toggle

  // Effect to load villages when district changes
  useEffect(() => {
    console.log('District selection changed:', selectedState, selectedDistrict); // Debug log
    if (!selectedState || !selectedDistrict) {
      setVillages([]);
      return;
    }

    // Load villages with error handling
    loadVillagesForDistrict(selectedState, selectedDistrict).catch(error => {
      console.error('Failed to load villages:', error);
      setVillages([]);
    });
  }, [selectedState, selectedDistrict]);

  // Function to show village boundary
  const showVillageBoundary = async (stateName, districtName, villageName) => {
    const map = mapRef.current;
    if (!map) {
      console.error('Map not initialized');
      return;
    }

    // Remove any existing village boundary
    removeLayerAndSource('village-boundary-highlight');

    if (!villageName) return;

    try {
      const stateClause = stateName === 'Telangana'
        ? `(UPPER(State)=UPPER('Telangana') OR UPPER(State) IN ('TS','TG'))`
        : `UPPER(State)=UPPER('${stateName}')`;
      const districtClause = districtName
        ? `(UPPER(District)=UPPER('${districtName}'))`
        : '';
      const parts = [
        stateClause,
        districtClause,
        `Name='${villageName}'`
      ].filter(Boolean);
      const where = parts.join(' AND ');
      
      const params = new URLSearchParams({
        where,
        outFields: '*',
        f: 'geojson'
      });

      const response = await fetch(`${VILLAGE_SERVICE}/query?${params}`);
      const data = await response.json();

      if (!data?.features?.length) {
        console.error('No village boundary found');
        return;
      }

      // Add village boundary to map
      map.addSource('village-boundary-highlight', { type: 'geojson', data });
      map.addLayer({
        id: 'village-boundary-highlight',
        type: 'line',
        source: 'village-boundary-highlight',
        paint: {
          'line-color': '#F07857', // Red color for village boundary
          'line-width': 3
        }
      });

      // Fit to village bounds
      const bounds = data.features[0].geometry.coordinates[0].reduce((bounds, coord) => {
        return [
          [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
          [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
        ];
      }, [[180, 90], [-180, -90]]);

      map.fitBounds(bounds, { padding: 50, duration: 1000 });
      // Cache geometry for Sentinel mask
      try { sentinelMaskGeomRef.current = (data.features?.[0]?.geometry) || null; } catch (_) { sentinelMaskGeomRef.current = null; }
    } catch (error) {
      console.error('Error showing village boundary:', error);
    }
  };

  
  // Registry of layer groups to control (add new entries here as you add layers)
  const layerGroups = [
    {
      id: "arcgis-features",
      label: "Water Bodies",
      // These suffixes correspond to how addArcGISFeatureLayer names sublayers
      sublayers: ["-fill", "-outline", "-line", "-circle", "-label"],
    },
    // Note: District and State boundaries are not auto-added anymore
  ];

  // Track which groups are visible
  const [visibleGroups, setVisibleGroups] = useState(() => new Set());
  const visibleGroupsRef = useRef(visibleGroups);
  useEffect(() => { visibleGroupsRef.current = visibleGroups; }, [visibleGroups]);

  // Water body state selection (only used when Water Bodies group is visible)
  const [selectedWaterState, setSelectedWaterState] = useState("");
  const selectedVillageRef = useRef("");
  useEffect(() => { selectedVillageRef.current = selectedVillage; }, [selectedVillage]);
  const showMNREGARef = useRef(false);
  useEffect(() => { showMNREGARef.current = showMNREGA; }, [showMNREGA]);
  const showFacilitiesRef = useRef(false);
  useEffect(() => { showFacilitiesRef.current = showFacilities; }, [showFacilities]);
  const waterBodySources = {
    Tripura: {
      url: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/Tripura_water_bodies/FeatureServer/0",
      bounds: [[91.2, 22.8], [92.4, 24.5]] // [southwest, northeast]
    },
    "Madhya Pradesh": {
      url: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/Madhya_pradesh_water_bodies/FeatureServer/0",
      bounds: [[74.3, 21.2], [82.8, 26.8]]
    },
    Telangana: {
      url: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/Telangana_Water__Bodies/FeatureServer/0",
      bounds: [[77.1, 15.8], [81.3, 19.9]]
    },
    Odisha: {
      url: "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/Odisha_water_bodies/FeatureServer/0",
      bounds: [[81.3, 17.7], [87.5, 22.5]]
    }
  };

  // Function to reset view to show all of India
  const resetToIndiaView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [78.9629, 22.5937],
      zoom: 4,
      duration: 1500
    });
  };

  // Helper to remove Water Bodies layers/sources and handle view
  const removeWaterBodiesLayer = () => {
    const map = mapRef.current;
    if (!map) return;
    const baseId = "arcgis-features";
    const sub = ["-fill", "-outline", "-line", "-circle"];
    sub.forEach((s) => {
      const id = `${baseId}${s}`;
      if (map.getLayer(id)) {
        try { map.removeLayer(id); } catch (_) {}
      }
    });
    if (map.getLayer(baseId)) {
      try { map.removeLayer(baseId); } catch (_) {}
    }
    if (map.getSource(baseId)) {
      try { map.removeSource(baseId); } catch (_) {}
    }

    // Reset to India view when removing water bodies layer
    if (!visibleGroups.has("boundaries-layer")) {
      resetToIndiaView();
    }
  };

  // Base map styles
  const styles = [
    { key: "streets", label: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
    { key: "satellite", label: "Satellite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  ];
  const [selectedStyle, setSelectedStyle] = useState(styles[0]);

  // Helper to apply current visibility to map layers
  const applyVisibility = () => {
    const map = mapRef.current;
    if (!map) return;
    layerGroups.forEach((group) => {
      const isVisible = visibleGroups.has(group.id);
      // Toggle potential sublayers (if they exist)
      group.sublayers.forEach((suffix) => {
        const layerId = `${group.id}${suffix}`;
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            isVisible ? "visible" : "none"
          );
        }
      });
      // Also toggle a base layer with the same id (e.g., raster tiles), if present
      if (map.getLayer(group.id)) {
        map.setLayoutProperty(
          group.id,
          "visibility",
          isVisible ? "visible" : "none"
        );
      }
    });
  };

  // Force-hide a group immediately (to avoid brief flash before applyVisibility runs)
  const forceHideGroup = (groupId) => {
    const map = mapRef.current;
    if (!map) return;
    const group = layerGroups.find((g) => g.id === groupId);
    if (!group) return;
    [...(group.sublayers || []), ""].forEach((suffix) => {
      const layerId = `${groupId}${suffix}`;
      if (map.getLayer(layerId)) {
        try { map.setLayoutProperty(layerId, "visibility", "none"); } catch (_) {}
      }
    });
  };

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      setError(
        "Missing VITE_MAPBOX_TOKEN. Create a .env file (see .env.example) with your Mapbox access token."
      );
      return;
    }
    mapboxgl.accessToken = token;

    let map;
    try {
      // Clear the container first
      if (mapContainer.current) {
        mapContainer.current.innerHTML = '';
      }

      map = new mapboxgl.Map({
        container: mapContainer.current,
        style: selectedStyle.url,
        center: [78.9629, 22.5937], // Center of India
        zoom: 4, // Zoom level to show all of India
        attributionControl: true,
        minZoom: 3, // Prevent zooming out too far
      });
      mapRef.current = map;

      map.on('error', (e) => {
        console.error('Mapbox GL Error:', e);
        setError('Error loading map: ' + e.error.message);
      });

      map.on('style.load', () => {
        map.resize();
      });

    } catch (err) {
      console.error('Map initialization error:', err);
      setError('Failed to initialize map: ' + err.message);
      return;
    }

    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", async () => {
      // Ensure proper sizing when the container becomes full-bleed
      map.resize();
      try {
        // Apply current visibility preferences once layers are added
        applyVisibility();
      } catch (e) {
        console.error(e);
        setError(
          "Failed to load map layers. Check console for details or CORS issues."
        );
      }
      // Attach click handler
      map.on('click', onMapClick);
    });

    // Keep map sized to container changes
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    if (mapContainer.current) ro.observe(mapContainer.current);

    // Safety: also resize after a short delay (layout settles)
    const t = setTimeout(() => map.resize(), 300);

    return () => {
      clearTimeout(t);
      ro.disconnect();
      const mapInstance = mapRef.current;
      if (mapInstance) {
        try {
          // detach click handler
          try { mapInstance.off('click', onMapClick); } catch (_) {}
          mapInstance.remove();
          mapRef.current = null;
        } catch (err) {
          console.error('Error during map cleanup:', err);
        }
      }
    };
  }, []);

  // When base style changes, update the map style and re-add our custom layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    // Change style and ensure it loads properly
    map.once('style.load', () => {
      map.resize();
      applyVisibility();
    });
    
    map.setStyle(selectedStyle.url);
    // After style loads, re-add sources/layers and apply visibility
    const onStyleLoad = async () => {
      try {
        // Do not automatically add Water Bodies on style change; handled by selection effect below
        
        // If Water Bodies group is visible and a state is chosen, re-add it after style change
        if (visibleGroups.has("arcgis-features") && selectedWaterState && waterBodySources[selectedWaterState]) {
          await addArcGISFeatureLayer(map, {
            id: "arcgis-features",
            featureServerUrl: waterBodySources[selectedWaterState],
            fit: false,
          });
          if (map.getLayer("arcgis-features-fill")) {
            map.setPaintProperty("arcgis-features-fill", "fill-color", "#0000FF");
            map.setPaintProperty("arcgis-features-fill", "fill-opacity", 0.4);
          }
          if (map.getLayer("arcgis-features-outline")) {
            map.setPaintProperty("arcgis-features-outline", "line-color", "#0000FF");
            map.setPaintProperty("arcgis-features-outline", "line-width", 1.5);
          }
        }

        // Re-add MNREGA layer if it was toggled on
        if (showMNREGA) {
          // Remove any existing remnants first
          removeLayerGroup('mnrega');
          const where = await buildMNREGAWhere();
          await addArcGISFeatureLayer(map, {
            id: 'mnrega',
            featureServerUrl: MNREGA_SERVICE,
            where: where || '1=1',
            fit: false,
            paintOverrides: {
              circle: { "circle-color": "#d32f2f", "circle-radius": 4 },
              line: { "line-color": "#d32f2f", "line-width": 1.2 },
              fill: { "fill-color": "#d32f2f", "fill-opacity": 0.15 },
              outline: { "line-color": "#d32f2f", "line-width": 1 },
            }
          });
        }

        // Re-add Facilities layer if toggled on
        if (showFacilities) {
          const whereFacilities = await buildFacilitiesWhere();
          removeLayerGroup('facilities');
          await addArcGISFeatureLayer(map, {
            id: 'facilities',
            featureServerUrl: FACILITIES_SERVICE,
            where: whereFacilities || '1=1',
            fit: false,
            paintOverrides: {
              circle: { 'circle-color': '#2e7d32', 'circle-radius': 4, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
              line: { 'line-color': '#2e7d32', 'line-width': 1 },
              fill: { 'fill-color': '#2e7d32', 'fill-opacity': 0.1 },
              outline: { 'line-color': '#2e7d32', 'line-width': 1 },
            }
          });
          await ensureFacilityIcons(map);
          addFacilitiesSymbolLayer(map);
        }
        // Re-add Sentinel LULC if toggled on
        if (showSentinel) {
          addSentinelLayer(map);
          await updateSentinelMask();
        }
      } catch (e) {
        console.error(e);
      }
      applyVisibility();
    };
    map.once("style.load", onStyleLoad);
    return () => {
      map.off("style.load", onStyleLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStyle]);

  // Toggle Sentinel LULC overlay when checkbox changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (showSentinel) {
      // Force a fresh geometry build on toggle
      sentinelMaskGeomRef.current = null;
      if (!selectedState && !selectedDistrict && !selectedVillage) {
        // Require at least a state to scope the overlay
        setError('Select a State (or District/Village) to view Sentinel LULC.');
        return;
      }
      if (!map.isStyleLoaded()) {
        map.once('style.load', () => addSentinelLayer(map));
      } else {
        addSentinelLayer(map);
      }
      // Auto-zoom to current selection hierarchy when enabling Sentinel
      (async () => {
        try {
          if (selectedState && selectedDistrict && selectedVillage) {
            await showVillageBoundary(selectedState, selectedDistrict, selectedVillage);
          } else if (selectedState && selectedDistrict) {
            await showDistrictBoundary(selectedState, selectedDistrict);
          } else if (selectedState) {
            await showStateBoundary(selectedState);
          }
        } catch (_) { /* non-fatal */ }
      })();
      // Build/update mask for current selection
      updateSentinelMask();
    } else {
      // Strong removal of any remnants
      removeSentinelLayer(map);
      removeSentinelMask(map);
      // Remove again on next idle in case something re-added asynchronously
      const onIdle = () => { try { removeSentinelLayer(map); removeSentinelMask(map); } catch (_) {} };
      const onStyle = () => { try { removeSentinelLayer(map); removeSentinelMask(map); } catch (_) {} };
      try { map.once('idle', onIdle); } catch (_) {}
      try { map.once('style.load', onStyle); } catch (_) {}
      return () => {
        try { map.off('idle', onIdle); } catch (_) {}
        try { map.off('style.load', onStyle); } catch (_) {}
      };
    }
  }, [showSentinel]);

  // Update Sentinel mask whenever selection changes
  useEffect(() => {
    const map = mapRef.current;
    // Always clear the cached geometry so we don't reuse previous state's shape
    sentinelMaskGeomRef.current = null;
    if (!showSentinel) return;
    // Remove old mask immediately to avoid showing old area while switching
    if (map) removeSentinelMask(map);
    if (selectedState) {
      updateSentinelMask();
    } else {
      if (map) removeSentinelLayer(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState, selectedDistrict, selectedVillage, showSentinel]);

  // Re-apply visibility any time the toggles change
  useEffect(() => {
    applyVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGroups]);

  // Fetch districts and water bodies when state is selected
  useEffect(() => {
    if (!selectedState) {
      setDistricts([]);
      removeLayerAndSource('state-boundary-highlight');
      removeLayerAndSource('district-boundary-highlight');
      removeLayerAndSource('arcgis-features');
      return;
    }

    console.log('Fetching districts for state:', selectedState);
    const stateCode = STATE_CODE[selectedState];
    const where = selectedState === 'Telangana'
      ? `state IN ('TS','TG')`
      : `state='${stateCode}'`;
    const url = `${DISTRICT_SERVICE}/query?where=${encodeURIComponent(where)}&outFields=district&returnDistinctValues=true&returnGeometry=false&f=json`;

    // Load water bodies for the selected state
    if (visibleGroups.has("arcgis-features")) {
      loadWaterBodies(selectedState);
    }

    // Fetch districts for the selected state
    fetch(url)
      .then(res => res.json())
      .then(json => {
        console.log('Districts response:', json);
        const districtList = (json.features || [])
          .map(f => {
            if (!f || !f.attributes) return null;
            return f.attributes.district || f.attributes.District;
          })
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        console.log('Processed district list:', districtList);
        setDistricts(districtList);
      })
      .catch(err => {
        console.error('Failed to load districts:', err);
        setDistricts([]);
      });

    // Highlight state boundary when state is selected
    showStateBoundary(selectedState);
  }, [selectedState, visibleGroups]);

  // Handle district selection changes
  useEffect(() => {
    if (!selectedState || !selectedDistrict) {
      removeLayerAndSource('district-boundary-highlight');
      if (!selectedState) {
        removeLayerAndSource('arcgis-features');
      }
      return;
    }

    // Show red boundary for selected district
    showDistrictBoundary(selectedState, selectedDistrict);

    // Load water bodies for the selected district
    if (visibleGroups.has("arcgis-features")) {
      loadWaterBodies(selectedState, selectedDistrict);
    }
  }, [selectedState, selectedDistrict, visibleGroups]);

  // Load or remove Water Bodies based on visibility + selected state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    const handleWaterBodies = async () => {
      try {
        const visible = visibleGroups.has("arcgis-features");
        
        // If layer is not visible or no state is selected, remove the layer
        if (!visible || !selectedWaterState || !waterBodySources[selectedWaterState]) {
          removeWaterBodiesLayer();
          if (!visible) resetToIndiaView();
          return;
        }

        // Wait for style to be loaded
        if (!map.isStyleLoaded()) {
          await new Promise(resolve => map.once('style.load', resolve));
        }

        // Remove any existing water bodies layer
        removeWaterBodiesLayer();

        // Add new water bodies layer
        await addArcGISFeatureLayer(map, {
          id: "arcgis-features",
          featureServerUrl: waterBodySources[selectedWaterState].url,
          fit: false,
        });

        // Style the layers
        if (map.getLayer("arcgis-features-fill")) {
          map.setPaintProperty("arcgis-features-fill", "fill-color", "#0000FF");
          map.setPaintProperty("arcgis-features-fill", "fill-opacity", 0.4);
        }
        if (map.getLayer("arcgis-features-outline")) {
          map.setPaintProperty("arcgis-features-outline", "line-color", "#0000FF");
          map.setPaintProperty("arcgis-features-outline", "line-width", 1.5);
        }

        // Zoom to state bounds
        const stateBounds = waterBodySources[selectedWaterState].bounds;
        if (stateBounds) {
          map.fitBounds(stateBounds, {
            padding: 50,
            duration: 1500
          });
        }
      } catch (e) {
        console.error('Error handling water bodies layer:', e);
        setError('Failed to load water bodies: ' + e.message);
      }
    };

    handleWaterBodies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleGroups, selectedWaterState]);

  // Toggle the on-demand Districts layer from DISTRICT_SERVICE
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const baseId = "toggle-districts";
    const addOrRemove = async () => {
      try {
        if (!showDistricts) {
          removeLayerGroup(baseId);
          return;
        }

        // Wait for style
        if (!map.isStyleLoaded()) {
          await new Promise((resolve) => map.once('style.load', resolve));
        }

        // Remove any existing before adding fresh
        removeLayerGroup(baseId);

        // Optional: filter to selected state if available
        let where;
        if (selectedState) {
          const code = STATE_CODE[selectedState];
          if (code) {
            const codes = selectedState === 'Telangana' ? ["TS", "TG"] : [code];
            const esc = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
            where = `state IN (${esc})`;
          }
        }

        await addArcGISFeatureLayer(map, {
          id: baseId,
          featureServerUrl: DISTRICT_SERVICE,
          where,
          fit: false,
        });

        // Style: hide fill, thin light-brown outline
        if (map.getLayer(`${baseId}-fill`)) {
          try { map.setPaintProperty(`${baseId}-fill`, 'fill-opacity', 0); } catch (_) {}
        }
        if (map.getLayer(`${baseId}-line`)) {
          try {
            map.setPaintProperty(`${baseId}-line`, 'line-color', '#8B4513');
            map.setPaintProperty(`${baseId}-line`, 'line-width', 0.2);
          } catch (_) {}
        }
        if (map.getLayer(`${baseId}-outline`)) {
          // Some geometries may create outline instead of line
          try {
            map.setPaintProperty(`${baseId}-outline`, 'line-color', '#8B4513');
            map.setPaintProperty(`${baseId}-outline`, 'line-width', 0.2);
          } catch (_) {}
        }
      } catch (e) {
        console.error('Failed to toggle districts layer:', e);
      }
    };

    addOrRemove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDistricts, selectedState]);

  // Toggle MNREGA layer from MapServer when checkbox is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const baseId = 'mnrega';
    const run = async () => {
      try {
        if (!showMNREGA) {
          removeLayerGroup(baseId);
          return;
        }

        // Ensure style is loaded before adding
        if (!map.isStyleLoaded()) {
          await new Promise((resolve) => map.once('style.load', resolve));
        }

        // Remove existing before adding fresh
        removeLayerGroup(baseId);

        const where = await buildMNREGAWhere();
        await addArcGISFeatureLayer(map, {
          id: baseId,
          featureServerUrl: MNREGA_SERVICE,
          where: where || '1=1',
          fit: false,
          paintOverrides: {
            circle: { "circle-color": "#d32f2f", "circle-radius": 4 },
            line: { "line-color": "#d32f2f", "line-width": 1.2 },
            fill: { "fill-color": "#d32f2f", "fill-opacity": 0.15 },
            outline: { "line-color": "#d32f2f", "line-width": 1 },
          }
        });
      } catch (e) {
        console.error('Failed to toggle MNREGA layer:', e);
      }
    };

    run();
  }, [showMNREGA, selectedState, selectedDistrict, selectedVillage]);

  // Toggle Facilities layer (PMGSY Rural Facilities) when checkbox is selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const baseId = 'facilities';
    const run = async () => {
      try {
        if (!showFacilities) {
          // Cleanup when the layer is turned off
          removeLayerGroup(baseId);
          if (map.getLayer('facilities-icons')) map.removeLayer('facilities-icons');
          return;
        }

        if (!map.isStyleLoaded()) {
          await new Promise((resolve) => map.once('style.load', resolve));
        }
        
        // Remove old layers before adding new ones
        removeLayerGroup(baseId);

        // Add the ArcGIS data as a source.
        // We keep the paintOverrides to provide a tiny fallback circle in case icons fail,
        // but we will hide this layer.
        const whereFacilities = await buildFacilitiesWhere();
        await addArcGISFeatureLayer(map, {
          id: baseId,
          featureServerUrl: FACILITIES_SERVICE,
          where: whereFacilities || '1=1',
          fit: false,
          paintOverrides: {
             circle: { 'circle-color': '#2e7d32', 'circle-radius': 4, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 }
          }
        });

        // Load your custom icon images into the map's style
        await ensureFacilityIcons(map);

        // Add the new symbol layer that uses your icons
        addFacilitiesSymbolLayer(map);

        // *** IMPORTANT: Hide the default circle layer ***
        // The addArcGISFeatureLayer utility creates a layer named `${id}-circle`.
        // We hide it so only our custom icon layer ('facilities-icons') is visible.
        if (map.getLayer('facilities-circle')) {
            map.setLayoutProperty('facilities-circle', 'visibility', 'none');
        }

      } catch (e) {
        console.error('Failed to toggle Facilities layer:', e);
      }
    };

    run();
  }, [showFacilities, selectedState, selectedDistrict, selectedVillage]);

  // Ensure custom images are available in the style
  const loadImageAsync = (map, url, name) => new Promise((resolve, reject) => {
    if (map.hasImage(name)) return resolve(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { try { map.addImage(name, img, { pixelRatio: 2 }); resolve(true); } catch (e) { resolve(false); } };
    img.onerror = reject;
    img.src = url;
  });

  const ensureFacilityIcons = async (map) => {
    await Promise.all([
      loadImageAsync(map, ICON_AGRO, 'agro-icon'),
      loadImageAsync(map, ICON_EDU, 'education-icon'),
      loadImageAsync(map, ICON_MED, 'medical-icon'),
      loadImageAsync(map, ICON_TRN, 'transport-admin-icon') // One icon for both
    ]);
  };

  const addFacilitiesSymbolLayer = (map) => {
    if (!map.getSource('facilities')) return;
    
    // Remove the layer if it already exists to prevent duplicates
    if (map.getLayer('facilities-icons')) {
      map.removeLayer('facilities-icons');
    }

    map.addLayer({
      id: 'facilities-icons',
      type: 'symbol',
      source: 'facilities', // This must match the id used in addArcGISFeatureLayer
      // Filter so this only applies to point geometries
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        // The 'icon-image' property uses an expression to select an icon
        'icon-image': [
          'match',
          // 1. Get the value from the 'facilitycat' field
          ['get', 'facilitycat'], 
          // 2. Define the matches
          'Agro', 'agro-icon',
          'Education', 'education-icon',
          'Medical', 'medical-icon',
          'Transport/Admin', 'transport-admin-icon',
          // 3. Provide a fallback icon (optional, but good practice)
          '' // No icon if no match
        ],
        'icon-size': 0.9,
        'icon-allow-overlap': true
      }
    });
  };

  // Resolve MNREGA service fields and build WHERE clause
  const ensureMNREGAFields = async () => {
    if (mnregaFields) return mnregaFields;
    try {
      const resp = await fetch(`${MNREGA_SERVICE}?f=json`);
      const data = await resp.json();
      const fields = Array.isArray(data?.fields) ? data.fields : [];
      setMnregaFields(fields);
      return fields;
    } catch (e) {
      console.error('Failed to fetch MNREGA fields:', e);
      setMnregaFields([]);
      return [];
    }
  };

  const pickField = (fields, candidates) => {
    const names = new Set(fields.map(f => String(f.name || f.alias || '').toLowerCase()));
    return candidates.find(c => names.has(c.toLowerCase())) || null;
  };

  const esc = (v) => String(v).replace(/'/g, "''");

  const buildMNREGAWhere = async () => {
    const fields = await ensureMNREGAFields();
    if (!fields || fields.length === 0) return null;

    const stateField = pickField(fields, [
      'state_name', 'STATE_NAME', 'State_Name', 'STATE', 'State', 'StateName', 'ST_NM', 'STATEUT', 'STNAME'
    ]);
    const districtField = pickField(fields, [
      'district_name', 'DISTRICT_NAME', 'District_Name', 'DISTRICT', 'District', 'DistrictName', 'DTNAME', 'DIST_NAME'
    ]);
    const villageField = pickField(fields, [
      'VILLAGE', 'Village', 'VILLAGE_NAME', 'Village_Name', 'VillageName', 'VILLNAME', 'VILL_NAME', 'GramPanchayat', 'GP_NAME'
    ]);

    const clauses = [];
    if (selectedState && stateField) {
      clauses.push(`UPPER(${stateField})=UPPER('${esc(selectedState)}')`);
    }
    if (selectedDistrict && districtField) {
      clauses.push(`UPPER(${districtField})=UPPER('${esc(selectedDistrict)}')`);
    }
    if (selectedVillage && villageField) {
      clauses.push(`UPPER(${villageField})=UPPER('${esc(selectedVillage)}')`);
    }
    if (clauses.length === 0) return null;
    return clauses.join(' AND ');
  };

  // Build MNREGA WHERE for provided names (used on click per district)
  const buildMNREGAWhereFor = async (stateName, districtName, villageName) => {
    const fields = await ensureMNREGAFields();
    if (!fields || fields.length === 0) return null;

    const stateField = pickField(fields, [
      'state_name', 'STATE_NAME', 'State_Name', 'STATE', 'State', 'StateName', 'ST_NM', 'STATEUT', 'STNAME'
    ]);
    const districtField = pickField(fields, [
      'district_name', 'DISTRICT_NAME', 'District_Name', 'DISTRICT', 'District', 'DistrictName', 'DTNAME', 'DIST_NAME'
    ]);
    const villageField = pickField(fields, [
      'VILLAGE', 'Village', 'VILLAGE_NAME', 'Village_Name', 'VillageName', 'VILLNAME', 'VILL_NAME', 'GramPanchayat', 'GP_NAME'
    ]);

    const clauses = [];
    if (stateName && stateField) clauses.push(`UPPER(${stateField})=UPPER('${esc(stateName)}')`);
    if (districtName && districtField) clauses.push(`UPPER(${districtField})=UPPER('${esc(districtName)}')`);
    if (villageName && villageField) clauses.push(`UPPER(${villageField})=UPPER('${esc(villageName)}')`);
    if (clauses.length === 0) return null;
    return clauses.join(' AND ');
  };

  return (
    <div className="relative h-screen w-full overflow-hidden flex flex-col">
      {/* Top Navigation Bar */}
      <div className="w-full bg-white shadow-md z-20">
        <div className="container mx-auto px-4 py-3">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-6 border-b border-gray-200">
            {/* Location Selection */}
            <div className="flex-1 -mb-px">
              <div className="flex items-center gap-4">
                <select
                  className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm min-w-[180px]"
                  value={selectedState}
                  onChange={(e) => {
                    const newState = e.target.value;
                    setSelectedState(newState);
                    setSelectedDistrict("");
                    setSelectedVillage("");
                    removeLayerAndSource('district-boundary-highlight');
                    if (!newState) {
                      removeLayerAndSource('state-boundary-highlight');
                    }
                  }}
                >
                  <option value="">Select State</option>
                  {Object.keys(STATE_CODE).map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>

                <select
                  className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm min-w-[180px]"
                  value={selectedDistrict}
                  onChange={(e) => {
                    const newDistrict = e.target.value;
                    setSelectedDistrict(newDistrict);
                    setSelectedVillage("");
                  }}
                  disabled={!selectedState}
                >
                  <option value="">Select District</option>
                  {districts.map(district => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>

                <select
                  className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm min-w-[180px]"
                  value={selectedVillage}
                  onChange={(e) => {
                    const newVillage = e.target.value;
                    setSelectedVillage(newVillage);
                    if (newVillage) {
                      showVillageBoundary(selectedState, selectedDistrict, newVillage);
                    } else {
                      removeLayerAndSource('village-boundary-highlight');
                    }
                    if (visibleGroups.has("arcgis-features")) {
                      loadWaterBodies(selectedState, selectedDistrict, newVillage);
                    }
                  }}
                  disabled={!selectedDistrict}
                >
                  <option value="">-- All Villages --</option>
                  {villages.map(village => (
                    <option key={village} value={village}>{village}</option>
                  ))}
                </select>

                {/* Show Districts toggle (on-demand districts overlay) */}
                <label className="flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={showDistricts}
                    onChange={(e) => setShowDistricts(e.target.checked)}
                  />
                  <span>Show Districts</span>
                </label>
              </div>
            </div>

            {/* Base Map Style Selector */}
            <div className="flex items-center">
              <select
                className="text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                value={selectedStyle.key}
                onChange={(e) => {
                  const next = styles.find((s) => s.key === e.target.value);
                  if (next) setSelectedStyle(next);
                }}
              >
                {styles.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Layers Section - Only visible when state is selected */}
          {selectedState && (
            <div className="mt-3">
              <div className="flex items-center gap-6">
                <span className="text-sm font-medium text-gray-600">Layers:</span>
                {layerGroups.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={visibleGroups.has(g.id)}
                      onChange={(e) =>
                        setVisibleGroups((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(g.id);
                          else next.delete(g.id);
                          return next;
                        })
                      }
                    />
                    <span>{g.label}</span>
                  </label>
                ))}
                {/* MNREGA layer toggle (moved here next to Water Bodies) */}
                <label className="flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={showMNREGA}
                    onChange={(e) => setShowMNREGA(e.target.checked)}
                  />
                  <span>MNREGA</span>
                </label>
                {/* Facilities layer toggle */}
                <label className="flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={showFacilities}
                    onChange={(e) => setShowFacilities(e.target.checked)}
                  />
                  <span>Facilities</span>
                </label>
                {/* Sentinel LULC (ArcGIS MapServer raster) */}
                <label className="flex items-center gap-2 text-sm text-gray-800 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={showSentinel}
                    onChange={(e) => setShowSentinel(e.target.checked)}
                  />
                  <span>Land Covers</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute top-20 left-4 z-30">
          <div className="rounded-md border border-amber-300 bg-amber-50/95 text-amber-900 p-2 text-xs max-w-sm">
            {error}
          </div>
        </div>
      )}

      {/* Click Info Panel */}
      {clickedInfo && (
        <div className="absolute top-20 right-4 z-30 max-w-md">
          <div className="bg-white/95 backdrop-blur rounded-lg shadow border border-gray-200 p-3">
            <div className="text-sm font-semibold text-gray-700 mb-2">Location Info</div>
            <table className="w-full text-xs text-gray-800">
              <tbody>
                <tr>
                  <td className="py-1 pr-2 font-medium text-gray-600">State</td>
                  <td className="py-1">{clickedInfo.stateName || '-'}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2 font-medium text-gray-600">District</td>
                  <td className="py-1">{clickedInfo.districtName || '-'}</td>
                </tr>
                {clickedInfo.water && (
                  <tr>
                    <td className="py-1 pr-2 font-medium text-gray-600">Water bodies (count)</td>
                    <td className="py-1">{clickedInfo.water.count}</td>
                  </tr>
                )}
                {showFacilities && clickedInfo.facilities && (
                  <>
                    <tr>
                      <td className="py-1 pr-2 font-medium text-gray-600">Facilities - Agro</td>
                      <td className="py-1">{clickedInfo.facilities.agro ?? '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-2 font-medium text-gray-600">Facilities - Education</td>
                      <td className="py-1">{clickedInfo.facilities.education ?? '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-2 font-medium text-gray-600">Facilities - Medical</td>
                      <td className="py-1">{clickedInfo.facilities.medical ?? '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-2 font-medium text-gray-600">Facilities - Transport/Admin</td>
                      <td className="py-1">{clickedInfo.facilities.transportAdmin ?? '-'}</td>
                    </tr>
                  </>
                )}
                {showMNREGA && (
                  <>
                    <tr>
                      <td className="py-1 pr-2 font-medium text-gray-600">tot_fra_beneficiaries_regis</td>
                      <td className="py-1">{clickedInfo.mnrega?.tot_fra_beneficiaries_regis ?? '-'}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-2 font-medium text-gray-600">no_fra_beneficiaries_having</td>
                      <td className="py-1">{clickedInfo.mnrega?.no_fra_beneficiaries_having ?? '-'}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Map Container */}
      <div 
        ref={mapContainer} 
        className="flex-1 w-full bg-gray-100"
        style={{ minHeight: 'calc(100vh - 100px)' }} 
      />
    </div>
  );
}
