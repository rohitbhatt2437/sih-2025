import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { addArcGISFeatureLayer } from '../utils/mapLayers';

export default function DSS() {
  // Same-origin API in production; dev uses env/localhost
  const baseUrl = import.meta.env.PROD ? '' : (import.meta.env.VITE_SERVER_URL || 'http://localhost:4000');
  // Use the same token variable as Home.jsx for consistency
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_GEOCODING_TOKEN || '';

  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportData, setReportData] = useState(null); // { url, data, contentType }
  const [reportHtml, setReportHtml] = useState('');

  // Selections
  const [stateSel, setStateSel] = useState('');
  const [districtSel, setDistrictSel] = useState('');
  const [villageSel, setVillageSel] = useState('');
  const [loadingLists, setLoadingLists] = useState(false);
  const [districtOptions, setDistrictOptions] = useState([]);
  const [villages, setVillages] = useState([]);

  const states = ['Odisha', 'Telangana', 'Tripura', 'Madhya Pradesh'];

  // ArcGIS services
  const STATES_FS = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary/FeatureServer/0';
  const DISTRICTS_FS = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary/FeatureServer/0';
  const VILLAGE_SERVICE = 'https://livingatlas.esri.in/server/rest/services/IAB2024/IAB_Village_2024/MapServer/0';

  // Fields
  const STATE_FIELD_DISTRICTS_FS = 'state';
  const DISTRICT_NAME_FIELD = 'district';
  const STATE_LABEL_TO_CODE = {
    'Madhya Pradesh': 'MP',
    'Tripura': 'TR',
    'Odisha': 'OD',
    'Telangana': 'TS', // include TG as alternate in WHERE
  };

  const districtFieldCandidates = [DISTRICT_NAME_FIELD, 'District', 'DISTRICT'];

  // Helpers
  async function queryFeatures(featureServerUrl, params) {
    const body = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      returnGeometry: 'false',
      f: 'json',
      ...params,
    }).toString();
    const resp = await fetch(`${featureServerUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!resp.ok) throw new Error(`ArcGIS query failed: ${resp.status}`);
    const json = await resp.json();
    return json.features?.map((f) => f.attributes || {}) || [];
  }

  // Lightweight client-side fallback formatter in case Gemini formatter is unavailable
  function formatHtmlFallback(json, ctx = {}) {
    try {
      const data = typeof json === 'object' ? json : JSON.parse(String(json || '{}'));
      const aoi = data.aoi || {};
      const meta = data.meta || {};
      const ind = data.indicators || {};
      const state = ctx.state || aoi.state || '—';
      const district = ctx.district || aoi.district || '—';
      const village = ctx.village || aoi.village || '—';
      const areaRaw = aoi.area_sqkm;
      let areaTxt = '—';
      if (typeof areaRaw === 'number') areaTxt = `${areaRaw.toFixed(2)} km²`;
      else if (typeof areaRaw === 'string' && !isNaN(Number(areaRaw))) areaTxt = `${Number(areaRaw).toFixed(2)} km²`;

      const pct = (v) => (v == null || isNaN(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`);
      const num = (v) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-IN'));

      const lulc = ind.lulc_pc || {};
      const gw = ind.groundwater || ind.gw || {};
      const mgnrega = ind.mgnrega || {};

      const rows = [];
      if (lulc.forest_percentage != null) rows.push(`<tr><td>Forest cover</td><td>${pct(lulc.forest_percentage)}</td></tr>`);
      if (lulc.cropland_percentage != null) rows.push(`<tr><td>Cropland</td><td>${pct(lulc.cropland_percentage)}</td></tr>`);
      if (lulc.builtup_percentage != null) rows.push(`<tr><td>Built-up</td><td>${pct(lulc.builtup_percentage)}</td></tr>`);
      if (gw.pre_monsoon_depth_m != null) rows.push(`<tr><td>Pre-monsoon depth</td><td>${Number(gw.pre_monsoon_depth_m).toFixed(1)} m bgl</td></tr>`);
      if (gw.seasonal_delta_m != null) rows.push(`<tr><td>Seasonal delta</td><td>${Number(gw.seasonal_delta_m).toFixed(1)} m</td></tr>`);
      if (mgnrega.jobcard_issuance_pct != null) rows.push(`<tr><td>Jobcards issued</td><td>${pct(mgnrega.jobcard_issuance_pct)}</td></tr>`);
      if (mgnrega.worker_activation_pct != null) rows.push(`<tr><td>Worker activation</td><td>${pct(mgnrega.worker_activation_pct)}</td></tr>`);
      if (mgnrega.women_participation_pct != null) rows.push(`<tr><td>Women participation</td><td>${pct(mgnrega.women_participation_pct)}</td></tr>`);

      const notes = Array.isArray(meta.notes) ? meta.notes : [];

      return `
        <section>
          <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;">DSS Recommendations – ${village !== '—' ? village : (district !== '—' ? district : state)}, ${state}</h2>
          <p style="margin:0 0 12px;color:#374151;font-size:12px;">AOI: State ${state} · District ${district} · Village ${village} · Area ${areaTxt}</p>
        </section>
        <section>
          <h3 style="margin:16px 0 8px;font-size:16px;font-weight:600;">Context Snapshot</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tbody>
              ${rows.map(r => r.replace(/\n/g, '')).join('') || '<tr><td colspan="2">No key indicators available.</td></tr>'}
            </tbody>
          </table>
          ${notes.length ? `<p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Notes: ${notes.join('; ')}</p>` : ''}
        </section>
      `;
    } catch {
      return '<p>Unable to format report.</p>';
    }
  }

  function pickFirst(attrs, candidates) {
    for (const k of candidates) {
      if (attrs && Object.prototype.hasOwnProperty.call(attrs, k)) return attrs[k];
    }
    return undefined;
  }

  function removeLayerGroup(baseId) {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    const sub = ['-fill', '-outline', '-line', '-circle', '-label'];
    sub.forEach((s) => {
      const id = `${baseId}${s}`;
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
    });
    try { if (map.getLayer(baseId)) map.removeLayer(baseId); } catch (_) {}
    try { if (map.getSource(baseId)) map.removeSource(baseId); } catch (_) {}
  }

  function removeVillageBoundary() {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    const layers = ['dss-village-boundary-fill', 'dss-village-boundary-outline'];
    layers.forEach((lid) => { try { if (map.getLayer(lid)) map.removeLayer(lid); } catch (_) {} });
    try { if (map.getSource('dss-village-boundary')) map.removeSource('dss-village-boundary'); } catch (_) {}
  }

  // WHERE builders
  function buildWhereForState_onDistrictsFS(stateLabel) {
    const code = STATE_LABEL_TO_CODE[stateLabel] || stateLabel;
    const codes = code === 'TS' ? ['TS', 'TG'] : [code];
    const escCodes = codes.map((c) => `'${String(c).replace(/'/g, "''")}'`).join(',');
    return `${STATE_FIELD_DISTRICTS_FS} IN (${escCodes})`;
  }
  function buildWhereForDistrict_onDistrictsFS(stateLabel, districtName) {
    const stateClause = buildWhereForState_onDistrictsFS(stateLabel);
    const ed = String(districtName || '').replace(/'/g, "''");
    const distClause = `UPPER(${DISTRICT_NAME_FIELD})='${ed.toUpperCase()}'`;
    return `(${stateClause}) AND (${distClause})`;
  }

  useEffect(() => {
    let raf = 0;
    let ro = null;
    let unloadHandler = null;
    function init() {
      if (mapRef.current) return;
      if (!mapContainerRef.current) {
        raf = requestAnimationFrame(init);
        return;
      }
      if (!MAPBOX_TOKEN) {
        setError('Missing VITE_MAPBOX_TOKEN for DSS map');
        return;
      }
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [78.9629, 22.5937],
        zoom: 4.2,
        attributionControl: true,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => map.resize());
      ro = new ResizeObserver(() => map.resize());
      if (mapContainerRef.current) ro.observe(mapContainerRef.current);
      map.on('error', (e) => {
        const err = e?.error || e;
        const msg = (err && (err.message || err.statusText)) || 'Map failed to load';
        setError(prev => prev || msg);
      });
      if (import.meta.env.DEV) {
        // In StrictMode React will mount->unmount->mount; avoid removing map on the simulated unmount.
        unloadHandler = () => { try { map.remove(); } catch {} };
        window.addEventListener('beforeunload', unloadHandler);
      }
      return () => {};
    }
    const cleanup = init();
    return () => { 
      if (raf) cancelAnimationFrame(raf);
      if (ro) try { ro.disconnect(); } catch {}
      if (!import.meta.env.DEV) {
        // Production: safe to remove on unmount
        const m = mapRef.current; if (m) { try { m.remove(); } catch {} mapRef.current = null; }
      } else {
        // Dev: rely on beforeunload to cleanup to avoid StrictMode flicker
        if (unloadHandler) window.removeEventListener('beforeunload', unloadHandler);
      }
      if (typeof cleanup === 'function') cleanup();
    };
  }, [MAPBOX_TOKEN]);

  // Load districts when state changes
  useEffect(() => {
    let cancelled = false;
    async function loadDistrictsForState(stName) {
      try {
        setLoadingLists(true);
        setError('');
        if (!stName) { if (!cancelled) setDistrictOptions([]); return; }
        const rows = await queryFeatures(DISTRICTS_FS, {
          where: buildWhereForState_onDistrictsFS(stName),
          returnDistinctValues: true,
          outFields: DISTRICT_NAME_FIELD,
          resultRecordCount: 5000,
        });
        const out = new Set();
        for (const r of rows) {
          const dt = String(r[DISTRICT_NAME_FIELD] || pickFirst(r, districtFieldCandidates) || '').trim();
          if (dt) out.add(dt);
        }
        if (!cancelled) setDistrictOptions(Array.from(out).sort((a,b)=>a.localeCompare(b)));
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    }
    setDistrictSel('');
    setVillageSel('');
    setVillages([]);
    removeVillageBoundary();
    loadDistrictsForState(stateSel);
    return () => { cancelled = true; };
  }, [stateSel]);

  // Overlay selected State/District polygons on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyOverlays = async () => {
      removeLayerGroup('dss-districts-all');
      removeLayerGroup('dss-districts-selected');
      removeLayerGroup('dss-states');
      if (!stateSel) return;
      try {
        await addArcGISFeatureLayer(map, {
          id: 'dss-states',
          featureServerUrl: STATES_FS,
          where: `(State_Name='${(STATE_LABEL_TO_CODE[stateSel]||stateSel).replace(/'/g, "''")}') OR (State_FSI='${String(stateSel).replace(/'/g, "''")}')`,
          fit: false,
        });
        if (map.getLayer('dss-states-fill')) {
          map.setPaintProperty('dss-states-fill', 'fill-color', '#5a8dee');
          map.setPaintProperty('dss-states-fill', 'fill-opacity', 0.25);
        }
        if (map.getLayer('dss-states-outline')) {
          map.setPaintProperty('dss-states-outline', 'line-color', '#2a5bbf');
          map.setPaintProperty('dss-states-outline', 'line-width', 1.2);
        }

        const whereAll = buildWhereForState_onDistrictsFS(stateSel);
        await addArcGISFeatureLayer(map, {
          id: 'dss-districts-all',
          featureServerUrl: DISTRICTS_FS,
          where: whereAll,
          fit: !districtSel,
          labelField: DISTRICT_NAME_FIELD,
          paintOverrides: { label: { 'text-size': 10, 'text-color': '#1d4ed8' } },
        });
        if (map.getLayer('dss-districts-all-fill')) {
          map.setPaintProperty('dss-districts-all-fill', 'fill-color', '#3b82f6');
          map.setPaintProperty('dss-districts-all-fill', 'fill-opacity', 0.20);
        }
        if (map.getLayer('dss-districts-all-outline')) {
          map.setPaintProperty('dss-districts-all-outline', 'line-color', '#1d4ed8');
          map.setPaintProperty('dss-districts-all-outline', 'line-width', 1.2);
        }

        if (districtSel) {
          const whereOne = buildWhereForDistrict_onDistrictsFS(stateSel, districtSel);
          await addArcGISFeatureLayer(map, {
            id: 'dss-districts-selected',
            featureServerUrl: DISTRICTS_FS,
            where: whereOne,
            fit: true,
            labelField: DISTRICT_NAME_FIELD,
            paintOverrides: { label: { 'text-size': 11, 'text-color': '#b45309' } },
          });
          if (map.getLayer('dss-districts-selected-fill')) {
            map.setPaintProperty('dss-districts-selected-fill', 'fill-color', '#f59e0b');
            map.setPaintProperty('dss-districts-selected-fill', 'fill-opacity', 0.45);
            try { map.moveLayer('dss-districts-selected-fill'); } catch (_) {}
          }
          if (map.getLayer('dss-districts-selected-outline')) {
            map.setPaintProperty('dss-districts-selected-outline', 'line-color', '#d97706');
            map.setPaintProperty('dss-districts-selected-outline', 'line-width', 2.0);
            try { map.moveLayer('dss-districts-selected-outline'); } catch (_) {}
          }
          try { map.moveLayer('dss-districts-selected-label'); } catch (_) {}
        }
      } catch (e) {
        console.error(e);
      }
    };
    if (map.isStyleLoaded && map.isStyleLoaded()) applyOverlays(); else map.once('style.load', applyOverlays);
  }, [stateSel, districtSel]);

  // Load villages when district changes
  useEffect(() => {
    async function loadVillagesForDistrict(stateName, districtName) {
      if (!stateName || !districtName) { setVillages([]); return; }
      try {
        const where = [
          `UPPER(State)=UPPER('${String(stateName).replace(/'/g, "''")}')`,
          `UPPER(District)=UPPER('${String(districtName).replace(/'/g, "''")}')`
        ].join(' AND ');
        const stats = JSON.stringify([{ statisticType: 'count', onStatisticField: 'Name', outStatisticFieldName: 'cnt' }]);
        const pageSize = 2000;
        let resultOffset = 0;
        const names = new Set();
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
          const res = await fetch(url);
          const data = await res.json();
          if (!data || !Array.isArray(data.features)) break;
          data.features.forEach(feat => {
            const n = feat?.attributes?.Name || feat?.attributes?.name;
            if (n && typeof n === 'string') names.add(n.trim());
          });
          if (data.exceededTransferLimit && data.features.length > 0) {
            resultOffset += data.features.length;
          } else {
            break;
          }
        }
        setVillages(Array.from(names).sort((a,b)=>a.localeCompare(b)));
      } catch (e) {
        console.error('Failed to load villages:', e);
        setVillages([]);
      }
    }
    setVillageSel('');
    removeVillageBoundary();
    if (stateSel && districtSel) loadVillagesForDistrict(stateSel, districtSel); else setVillages([]);
  }, [stateSel, districtSel]);

  // Show village boundary when village changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    async function showVillageBoundary(stateName, districtName, villageName) {
      removeVillageBoundary();
      if (!villageName) return;
      try {
        const parts = [
          `State='${String(stateName).replace(/'/g, "''")}'`,
          `District='${String(districtName).replace(/'/g, "''")}'`,
          `Name='${String(villageName).replace(/'/g, "''")}'`
        ];
        const where = parts.join(' AND ');
        const params = new URLSearchParams({ where, outFields: '*', f: 'geojson' });
        const response = await fetch(`${VILLAGE_SERVICE}/query?${params}`);
        const data = await response.json();
        if (!data?.features?.length) return;
        map.addSource('dss-village-boundary', { type: 'geojson', data });
        map.addLayer({ id: 'dss-village-boundary-fill', type: 'fill', source: 'dss-village-boundary', paint: { 'fill-color': '#8B4513', 'fill-opacity': 0.35 } });
        map.addLayer({ id: 'dss-village-boundary-outline', type: 'line', source: 'dss-village-boundary', paint: { 'line-color': '#8B4513', 'line-width': 2 } });
      } catch (e) {
        console.error('Error showing village boundary:', e);
      }
    }
    showVillageBoundary(stateSel, districtSel, villageSel);
  }, [villageSel, stateSel, districtSel]);

  async function onFetchData() {
    // Require at least state
    if (!stateSel) {
      setReportError('Please select a State first.');
      setReportData(null);
      return;
    }
    setReportLoading(true);
    setReportError('');
    setReportData(null);
    setReportHtml('');
    try {
      const upstreamBase = 'https://fra-report-generator-375005976373.europe-west1.run.app/report';
      const qs = new URLSearchParams();
      qs.set('state', stateSel);
      if (districtSel) qs.set('district', districtSel);
      if (villageSel) qs.set('village', villageSel);
      const upstreamUrl = `${upstreamBase}?${qs.toString()}`;
      const proxyUrl = `${baseUrl}/api/report?${qs.toString()}`;

      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`Report fetch failed: HTTP ${resp.status}`);
      const contentType = resp.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await resp.json();
      } else {
        data = await resp.text();
      }
      setReportData({ url: upstreamUrl, data, contentType });

      // If JSON, immediately show client-side formatted HTML, then try server formatter to enhance
      if ((contentType.includes('application/json') || typeof data === 'object') && data) {
        // Immediate client-side render to avoid raw JSON
        let immediate = formatHtmlFallback(data, { state: stateSel, district: districtSel, village: villageSel });
        if (immediate && immediate.startsWith('```')) {
          immediate = immediate.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
        }
        setReportHtml(immediate);
        setReportError('');

        // Fire-and-improve with server formatter (non-blocking UX)
        try {
          const fmtResp = await fetch(`${baseUrl}/api/report/format`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, context: { state: stateSel, district: districtSel, village: villageSel } })
          });
          if (fmtResp.ok) {
            const { html } = await fmtResp.json();
            if (typeof html === 'string' && html.trim()) {
              let improved = html.trim();
              if (improved.startsWith('```')) {
                improved = improved.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
              }
              setReportHtml(improved);
            }
          } else {
            console.warn('Formatter failed status:', fmtResp.status);
          }
        } catch (e) {
          console.warn('Formatter request threw:', e);
        }
      }
    } catch (e) {
      setReportError(e?.message || 'Failed to fetch report');
      console.error('Fetch report failed:', e);
    } finally {
      setReportLoading(false);
    }
  }
  return (
    <div className="w-full h-full flex gap-3 p-3">
      {/* Left: Map card */}
      <div className="w-full lg:w-1/2 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Decision Support Map</h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
              value={stateSel}
              onChange={(e) => setStateSel(e.target.value)}
            >
              <option value="">Select State</option>
              {states.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <select
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
              value={districtSel}
              onChange={(e) => setDistrictSel(e.target.value)}
              disabled={!stateSel || loadingLists}
            >
              <option value="">All Districts</option>
              {districtOptions.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
            <select
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
              value={villageSel}
              onChange={(e) => setVillageSel(e.target.value)}
              disabled={!districtSel || villages.length === 0}
            >
              <option value="">All Villages</option>
              {villages.map((v) => (<option key={v} value={v}>{v}</option>))}
            </select>
            <button
              onClick={onFetchData}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm shadow-sm disabled:opacity-50"
              disabled={reportLoading}
            >
              {reportLoading ? 'Generating report…' : 'Fetch Data'}
            </button>
          </div>
          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        </div>
        <div className="p-2">
          <div ref={mapContainerRef} className="h-[710px] w-full rounded-lg overflow-hidden" />
        </div>
      </div>
      {/* Right: Report panel */}
      <div className="hidden lg:flex flex-1 bg-white rounded-lg shadow-sm border border-gray-100 p-0 overflow-hidden flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h4 className="text-base font-semibold text-gray-900">Report</h4>
          {reportData?.url && (
            <a href={reportData.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Open in new tab</a>
          )}
        </div>
        <div className="p-4 overflow-y-auto h-[710px]">
          {!stateSel && (
            <div className="text-sm text-gray-600">Select at least a State and click "Fetch Data".</div>
          )}
          {reportLoading && (
            <div className="text-sm text-gray-600">Fetching report…</div>
          )}
          {reportError && (
            <div className="text-sm text-red-600">{reportError}</div>
          )}
          {!reportLoading && !reportError && reportData && (
            <div className="text-sm">
              {reportHtml ? (
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: reportHtml }} />
              ) : (
                String(reportData.contentType || '').includes('application/json') ? (
                  <pre className="text-xs bg-gray-50 border rounded p-3 whitespace-pre-wrap break-words">{JSON.stringify(reportData.data, null, 2)}</pre>
                ) : (
                  <pre className="text-xs bg-gray-50 border rounded p-3 whitespace-pre-wrap break-words">{String(reportData.data || '')}</pre>
                )
              )}
            </div>
          )}
          {!reportLoading && !reportError && !reportData && stateSel && (
            <div className="text-sm text-gray-600">Click "Fetch Data" to load the report.</div>
          )}
        </div>
      </div>
    </div>
  );
}
