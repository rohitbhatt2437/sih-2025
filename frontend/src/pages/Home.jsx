import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import OverviewBarChart from "../components/OverviewBarChart";
import { addArcGISFeatureLayer } from "../utils/mapLayers";

export default function Home() {
  // --- UI State for filters ---
  const allowedStates = ["Odisha", "Tripura", "Telangana", "Madhya Pradesh"]; // labels in UI
  const [stateSel, setStateSel] = useState(""); // "" means none
  const [districtSel, setDistrictSel] = useState("");
  const [loadingLists, setLoadingLists] = useState(false);
  const [error, setError] = useState("");
  const [districtOptions, setDistrictOptions] = useState([]); // all districts for allowed states (or for selected state)
  const mapContainer = useRef(null);
  const mapRef = useRef(null);

  // Use the specific State and District services from your provided snippet
  const STATES_FS = "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary/FeatureServer/0";
  const DISTRICTS_FS = "https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary/FeatureServer/0";

  // ArcGIS services
  // Note: also declared above for map overlay use

  // Fields and mapping
  // State service commonly uses 'State_Name' for code (MP/TR/OD/TS) and 'State_FSI' for full name
  const STATE_FIELD_STATES_FS = "State_Name"; // code field on state_boundary layer
  const STATE_FIELD_DISTRICTS_FS = "state";   // code field on district_boundary layer (lowercase)
  const DISTRICT_NAME_FIELD = "district";     // district name field on district_boundary layer (lowercase)
  const STATE_LABEL_TO_CODE = {
    "Madhya Pradesh": "MP",
    "Tripura": "TR",
    "Odisha": "OD",
    // Telangana may appear as TS or TG on different layers; we will handle both in WHERE
    "Telangana": "TS",
  };
  const stateFieldCandidates = [
    STATE_FIELD_STATES_FS,
    STATE_FIELD_DISTRICTS_FS,
    "STATE",
    "stname",
    "STATE_NAME",
    "ST_NM",
    "STNAME",
    "STATE_NM",
  ]; // heuristic with priority
  const districtFieldCandidates = [
    DISTRICT_NAME_FIELD, // lowercase (as in your district service)
    "District",
    "DISTRICT",
  ];

  // --- Helpers to query ArcGIS FeatureServer ---
  async function queryFeatures(featureServerUrl, params) {
    const body = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: "false",
      f: "json",
      ...params,
    }).toString();
    const resp = await fetch(`${featureServerUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok) throw new Error(`ArcGIS query failed: ${resp.status}`);
    const json = await resp.json();
    return json.features?.map((f) => f.attributes || {}) || [];
  }

  // WHERE builders
  // For the States FeatureServer (state_boundary)
  function buildWhereForState_onStatesFS(stateLabel) {
    // Try code match on State_Name OR name match on State_FSI for robustness
    const code = STATE_LABEL_TO_CODE[stateLabel] || stateLabel;
    const escCode = String(code).replace(/'/g, "''");
    const escName = String(stateLabel).replace(/'/g, "''");
    return `(State_Name='${escCode}' OR State_FSI='${escName}')`;
  }
  // For the Districts FeatureServer (district_boundary)
  function buildWhereForState_onDistrictsFS(stateLabel) {
    // Telangana may be TS or TG; include both codes
    const code = STATE_LABEL_TO_CODE[stateLabel] || stateLabel;
    const codes = code === "TS" ? ["TS", "TG"] : [code];
    const escCodes = codes.map((c) => `'${String(c).replace(/'/g, "''")}'`).join(",");
    return `${STATE_FIELD_DISTRICTS_FS} IN (${escCodes})`;
  }
  function buildWhereForDistrict_onDistrictsFS(stateLabel, districtName) {
    const stateClause = buildWhereForState_onDistrictsFS(stateLabel);
    const ed = districtName.replace(/'/g, "''");
    // Case-insensitive match using UPPER()
    const distClause = `UPPER(${DISTRICT_NAME_FIELD})='${ed.toUpperCase()}'`;
    const where = `(${stateClause}) AND (${distClause})`;
    return where;
  }

  // Remove a layer group (our utility creates -fill/-outline/-line/-circle/-label sublayers)
  function removeLayerGroup(baseId) {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    const sub = ["-fill", "-outline", "-line", "-circle", "-label"];
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
  }

  function pickFirst(attrs, candidates) {
    for (const k of candidates) {
      if (attrs && Object.prototype.hasOwnProperty.call(attrs, k)) return attrs[k];
    }
    return undefined;
  }

  // On first load, don't fetch all districts; district list depends on state
  useEffect(() => {
    setDistrictOptions([]);
  }, []);

  // When state changes, (re)load districts for that state; clear district selection
  useEffect(() => {
    let cancelled = false;
    async function loadDistrictsForState(stName) {
      try {
        setLoadingLists(true);
        setError("");
        if (!stName) {
          // No state -> clear districts
          if (!cancelled) setDistrictOptions([]);
          return;
        }
        // Query server-side by state to ensure full, accurate list (distinct districts)
        const rows = await queryFeatures(DISTRICTS_FS, {
          where: buildWhereForState_onDistrictsFS(stName),
          returnDistinctValues: true,
          outFields: DISTRICT_NAME_FIELD,
          resultRecordCount: 5000,
        });
        const out = new Set();
        for (const r of rows) {
          const dt = String(r[DISTRICT_NAME_FIELD] || pickFirst(r, districtFieldCandidates) || "").trim();
          if (dt) out.add(dt);
        }
        if (!cancelled) setDistrictOptions(Array.from(out).sort((a,b)=>a.localeCompare(b)));
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    }
    // Reset district selection when state changes and load
    setDistrictSel("");
    loadDistrictsForState(stateSel);
    return () => { cancelled = true; };
  }, [stateSel]);

  // Overlay selected State/District polygons on the left map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Shared hover popup
    let popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
    const setPointer = (isPointer) => {
      if (!map) return;
      map.getCanvas().style.cursor = isPointer ? 'pointer' : '';
    };
    const attachHover = (layerId) => {
      if (!map.getLayer(layerId)) return;
      const onMove = (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const name = f.properties?.[DISTRICT_NAME_FIELD] || '';
        if (!name) { setPointer(false); popup.remove(); return; }
        setPointer(true);
        popup
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-size:12px;font-weight:600">${name}</div>`)
          .addTo(map);
      };
      const onLeave = () => { setPointer(false); popup.remove(); };
      map.on('mousemove', layerId, onMove);
      map.on('mouseleave', layerId, onLeave);
      return () => {
        try { map.off('mousemove', layerId, onMove); } catch(_) {}
        try { map.off('mouseleave', layerId, onLeave); } catch(_) {}
      };
    };
    let detachAll = [];

    const applyOverlays = async () => {
      // Clear previous overlays first
      removeLayerGroup("home-districts-all");
      removeLayerGroup("home-districts-selected");
      removeLayerGroup("home-states");

      // Nothing selected -> render nothing
      if (!stateSel) return;

      try {
        // Add State polygon for selected state
        await addArcGISFeatureLayer(map, {
          id: "home-states",
          featureServerUrl: STATES_FS,
          where: buildWhereForState_onStatesFS(stateSel),
          fit: false,
        });
        // Style state fill subtle
        if (map.getLayer("home-states-fill")) {
          map.setPaintProperty("home-states-fill", "fill-color", "#5a8dee");
          map.setPaintProperty("home-states-fill", "fill-opacity", 0.25);
        }
        if (map.getLayer("home-states-outline")) {
          map.setPaintProperty("home-states-outline", "line-color", "#2a5bbf");
          map.setPaintProperty("home-states-outline", "line-width", 1.2);
        }

        // Always add all districts in state (blue) when a state is selected
        const whereAll = buildWhereForState_onDistrictsFS(stateSel);
        await addArcGISFeatureLayer(map, {
          id: "home-districts-all",
          featureServerUrl: DISTRICTS_FS,
          where: whereAll,
          fit: !districtSel, // fit when no specific district
          labelField: DISTRICT_NAME_FIELD,
          paintOverrides: { label: { "text-size": 10, "text-color": "#1d4ed8" } },
        });
        if (map.getLayer("home-districts-all-fill")) {
          map.setPaintProperty("home-districts-all-fill", "fill-color", "#3b82f6");
          map.setPaintProperty("home-districts-all-fill", "fill-opacity", 0.20);
        }
        if (map.getLayer("home-districts-all-outline")) {
          map.setPaintProperty("home-districts-all-outline", "line-color", "#1d4ed8");
          map.setPaintProperty("home-districts-all-outline", "line-width", 1.2);
        }

        // If a district is selected, add it as a separate orange layer on top
        if (districtSel) {
          const whereOne = buildWhereForDistrict_onDistrictsFS(stateSel, districtSel);
          await addArcGISFeatureLayer(map, {
            id: "home-districts-selected",
            featureServerUrl: DISTRICTS_FS,
            where: whereOne,
            fit: true, // zoom to selected
            labelField: DISTRICT_NAME_FIELD,
            paintOverrides: { label: { "text-size": 11, "text-color": "#b45309" } },
          });
          if (map.getLayer("home-districts-selected-fill")) {
            map.setPaintProperty("home-districts-selected-fill", "fill-color", "#f59e0b");
            map.setPaintProperty("home-districts-selected-fill", "fill-opacity", 0.45);
            try { map.moveLayer("home-districts-selected-fill"); } catch (_) {}
          }
          if (map.getLayer("home-districts-selected-outline")) {
            map.setPaintProperty("home-districts-selected-outline", "line-color", "#d97706");
            map.setPaintProperty("home-districts-selected-outline", "line-width", 2.0);
            try { map.moveLayer("home-districts-selected-outline"); } catch (_) {}
          }
          // Keep selected labels above
          try { map.moveLayer("home-districts-selected-label"); } catch(_) {}
        }

        // Attach hover tooltips for both layers' fills
        const d1 = attachHover('home-districts-all-fill');
        const d2 = attachHover('home-districts-selected-fill');
        detachAll = [d1, d2].filter(Boolean);
      } catch (e) {
        console.error(e);
      }
    };

    if (map.isStyleLoaded && map.isStyleLoaded()) {
      applyOverlays();
    } else {
      map.once("style.load", applyOverlays);
    }
    return () => {
      try { detachAll.forEach((fn) => fn && fn()); } catch(_) {}
    };
  }, [stateSel, districtSel]);

  // Selection summary text
  const selectionSummary = useMemo(() => {
    if (stateSel && districtSel) return `${districtSel}, ${stateSel}`;
    if (stateSel) return `${stateSel}`;
    if (districtSel) return `${districtSel}`; // unlikely since disabled until state selected, but keep for safety
    return "No selection";
  }, [stateSel, districtSel]);

  const chartData = [
    { label: "Fenced Bodies", value: 80 },
    { label: "Initiatives", value: 60 },
    { label: "Disease Outbreak", value: 30 },
    { label: "Oxygen Levels", value: 70 },
    { label: "Cleaning Activities", value: 50 },
    { label: "Water Bodies Monitored", value: 90 },
  ];

  const maxValue = 100; // for simple 0-100 visualization

  // Initialize base map on left panel
  useEffect(() => {
    let raf = 0;
    function init() {
      if (!mapContainer.current) {
        // Defer to next frame until ref is attached
        raf = requestAnimationFrame(init);
        return;
      }
      const token = import.meta.env.VITE_MAPBOX_TOKEN;
      if (!token) {
        console.warn("Missing VITE_MAPBOX_TOKEN for Home map");
        return;
      }
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [78.9629, 22.5937], // India approx (lng, lat)
        zoom: 4.2,
        attributionControl: true,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.resize();
      });
      const ro = new ResizeObserver(() => map.resize());
      if (mapContainer.current) ro.observe(mapContainer.current);
      return () => {
        ro.disconnect();
        map.remove();
      };
    }
    const cleanup = init();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Base Map card */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 border-b text-sm font-medium text-gray-800">FRA Titles Distributed</div>
            <div ref={mapContainer} className="h-[420px] w-full" />
          </div>
        </div>

        {/* Right: Filters and charts */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Header row: Title and selectors */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">FRA</h2>
            <div className="flex flex-col sm:flex-row gap-3">
          {/* State selector */}
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-600 font-semibold mb-1">State</label>
            <select
              className="min-w-[200px] text-sm px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              value={stateSel}
              onChange={(e) => setStateSel(e.target.value)}
            >
              <option value="">All</option>
              {allowedStates.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {/* District selector */}
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-600 font-semibold mb-1">District</label>
            <select
              className="min-w-[220px] text-sm px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-500"
              value={districtSel}
              onChange={(e) => setDistrictSel(e.target.value)}
              disabled={!stateSel || loadingLists}
            >
              <option value="">All</option>
              {districtOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
            </div>
          </div>

      {/* Selection summary */}
      <div className="text-sm text-gray-700">
        <span className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5">
          <span className="font-medium">Selection:</span> {selectionSummary}
          {loadingLists && <span className="text-gray-500">(loading...)</span>}
          {error && <span className="text-red-600">{error}</span>}
        </span>
      </div>

      {/* District chip list removed as requested: use dropdown only */}
      <div>
        <OverviewBarChart title="Overview" data={chartData} maxValue={maxValue} />
      </div>
        </div>
      </div>
    </div>
  );
}
