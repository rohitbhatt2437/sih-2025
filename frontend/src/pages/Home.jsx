import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { addArcGISFeatureLayer } from "../utils/mapLayers";
import ForestRightsCharts from "../components/ForestRightsCharts";

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

  // Generate random data for charts based on state/district selection
  const chartData = useMemo(() => {
    // Random number generator with min-max range
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    
    // Generate base numbers
    const ifrClaims = rand(600000, 900000);
    const ifrTitles = rand(200000, ifrClaims);
    const cfrClaims = rand(35000, 57000);
    const cfrTitles = rand(9000, cfrClaims);
    const totalClaims = ifrClaims + cfrClaims;
    
    return {
      state: stateSel || 'All India',
      // Individual Forest Rights
      ifrClaimsReceived: ifrClaims,
      ifrTitlesDistributed: ifrTitles,
      
      // Community Forest Rights
      cfrClaimsReceived: cfrClaims,
      cfrTitlesDistributed: cfrTitles,
      
      // Forest Land (in Lakh Acres)
      ifrForestLand: rand(6, 15),
      cfrForestLand: rand(70, 100),
      
      // Claims Status
      totalTitlesDistributed: ifrTitles + cfrTitles,
      pendingClaims: rand(700000, 800000),
      rejectedClaims: rand(1800000, 2000000),
    };
  }, [stateSel, districtSel]); // Regenerate when selection changes



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
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
          <h3 className="text-red-600 text-sm font-semibold mb-1">All India - Claims Received</h3>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold text-gray-900">5,123K</p>
              <p className="text-sm text-gray-600">Community (claims)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">4,911,495</p>
              <p className="text-sm text-gray-600">IFR</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
          <h3 className="text-green-600 text-sm font-semibold mb-1">All India - Total Titles Distributed</h3>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold text-gray-900">2,511K</p>
              <p className="text-sm text-gray-600">CFR</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">2,389,670</p>
              <p className="text-sm text-gray-600">IFR</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
          <h3 className="text-blue-600 text-sm font-semibold mb-1">All India - Extent of Forest Land Recognised</h3>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold text-gray-900">232.74</p>
              <p className="text-sm text-gray-600">Lakh Acres</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Base Map card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">FRA Implementation Map</h3>
            </div>
            <div className="p-2">
              <div ref={mapContainer} className="h-[580px] w-full rounded-lg overflow-hidden" />
            </div>
          </div>
        </div>

        {/* Right: Filters and charts */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Header row: Title and selectors */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-900">Forest Rights Act Analytics</h2>
              <div className="flex flex-col sm:flex-row gap-4">
          {/* State selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <select
                    className="w-full min-w-[200px] text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                    value={stateSel}
                    onChange={(e) => setStateSel(e.target.value)}
                  >
                    <option value="">All States</option>
                    {allowedStates.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                {/* District selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
                  <select
                    className="w-full min-w-[220px] text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
                    value={districtSel}
                    onChange={(e) => setDistrictSel(e.target.value)}
                    disabled={!stateSel || loadingLists}
                  >
                    <option value="">All Districts</option>
                    {districtOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Selection summary */}
            <div className="mt-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium">Current Selection:</span>
                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-md">
                  {selectionSummary}
                  {loadingLists && <span className="ml-2 text-blue-500">(loading...)</span>}
                </span>
                {error && <span className="text-red-600 ml-2">{error}</span>}
              </div>
            </div>
          </div>

          {/* Forest Rights Charts */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <ForestRightsCharts stateData={chartData} />
          </div>
        </div>
      </div>
    </div>
  );
}
