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
  const [pdfLoading, setPdfLoading] = useState(false);

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

  // Pretty loading UI for report panel
  function ReportSkeleton() {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-5 w-2/3 bg-gray-200 rounded" />
        <div className="h-3 w-5/6 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 bg-gray-200 rounded" />
          <div className="h-24 bg-gray-200 rounded" />
        </div>
        <div className="h-4 w-1/2 bg-gray-200 rounded" />
        <div className="space-y-2">
          <div className="h-3 w-full bg-gray-200 rounded" />
          <div className="h-3 w-11/12 bg-gray-200 rounded" />
          <div className="h-3 w-10/12 bg-gray-200 rounded" />
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          <span className="text-sm">Generating report…</span>
        </div>
      </div>
    );
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

  // Deterministic report builder that follows our sectioned layout (A–F)
  // client helper mappings for nicer data source labels
  const DATA_SOURCE_LABELS = {
    'services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary': 'State boundary (FeatureServer)',
    'services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary': 'District boundary (FeatureServer)',
    'livingatlas.esri.in/server/rest/services/IAB2024/IAB_Village_2024': 'Village (IAB2024) MapServer',
    'livingatlas.esri.in/server1/rest/services/Water/Pre_Post_Monsoon_Water_Level_Depth/FeatureServer/1': 'Groundwater Pre-monsoon (FeatureServer/1)',
    'livingatlas.esri.in/server1/rest/services/Water/Pre_Post_Monsoon_Water_Level_Depth/FeatureServer/2': 'Groundwater During-monsoon (FeatureServer/2)',
    'livingatlas.esri.in/server1/rest/services/Water/Pre_Post_Monsoon_Water_Level_Depth/FeatureServer/3': 'Groundwater Post-monsoon (FeatureServer/3)'
  };
  const SHORT_SOURCE_LABELS = {
    state: 'State boundary', district: 'District boundary', village: 'Village (IAB2024)',
    groundwater_pre_monsoon: 'Groundwater (Pre-monsoon)', groundwater_during_monsoon: 'Groundwater (During-monsoon)',
    groundwater_post_monsoon: 'Groundwater (Post-monsoon)', aquifer: 'Aquifer', rural_facilities: 'PMGSY Rural Facilities',
    mgnrega_workers: 'MGNREGA workers'
  };

  function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function findLabelForUrl(u) {
    try { const s = String(u || ''); const key = Object.keys(DATA_SOURCE_LABELS).find(k => s.includes(k)); if (key) return DATA_SOURCE_LABELS[key]; const url = new URL(s); const parts = url.pathname.split('/').filter(Boolean); if (parts.length >= 2) return parts.slice(-2).join('/'); return url.hostname; } catch { return String(u || '').slice(0, 60); }
  }
  function normalizeSourceEntry(entry) {
    if (entry == null) return { label: '', url: '', raw: '' };
    if (typeof entry === 'object') { const keys = Object.keys(entry); if (keys.length === 1 && typeof entry[keys[0]] === 'string') { const k = keys[0]; const url = entry[k]; const label = SHORT_SOURCE_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1)); return { label, url, raw: url }; } const url = entry.url || entry.link || entry.source || null; const label = entry.label || entry.name || (url ? findLabelForUrl(url) : JSON.stringify(entry)); return { label, url, raw: url || JSON.stringify(entry) }; }
    const s = String(entry).trim(); const kv = s.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(https?:\/\/\S+)$/i) || s.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(\S+)$/i);
    if (kv) { const key = kv[1]; const val = kv[2]; const label = SHORT_SOURCE_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); return { label, url: val, raw: val }; }
    if (/^https?:\/\//i.test(s)) return { label: findLabelForUrl(s), url: s, raw: s };
    return { label: s, url: '', raw: s };
  }

  function renderDeterministicReport(json, ctx = {}) {
    try {
      const data = typeof json === 'object' ? json : JSON.parse(String(json || '{}'));
      const aoi = data.aoi || {};
      const meta = data.meta || {};
      const ind = data.indicators || {};
      const state = (ctx.state || aoi.state || '').trim() || '—';
      const district = (ctx.district || aoi.district || '').trim() || '—';
      const village = (ctx.village || aoi.village || '').trim() || '—';

      const rawArea = aoi.area_sqkm ?? aoi.geographic_area_sqkm ?? aoi?.additional_attributes?.area_sqkm;
      let areaKm2 = null; if (typeof rawArea === 'number') areaKm2 = rawArea > 1e7 ? rawArea / 1e6 : rawArea; else if (typeof rawArea === 'string' && !isNaN(Number(rawArea))) { const n = Number(rawArea); areaKm2 = n > 1e7 ? n / 1e6 : n; }
      const areaTxt = areaKm2 != null ? `${areaKm2.toFixed(2)} km²` : '—';

      const pct = (v, d = 2) => (v == null || isNaN(Number(v)) ? '—' : `${Number(v).toFixed(d)}%`);
      const num = (v) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-IN'));
      const fix = (v, d = 2) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toFixed(d));

      const lulc = ind.lulc_pc || ind.lulc || {};
      const gw = ind.gw || ind.groundwater || {};
      const aquifer = ind.aquifer || {};
      const mgn = ind.mgnrega || {};

      const forestPct = lulc.forest_percentage;
      const preDepth = gw.pre_monsoon_depth_m ?? gw.district_pre2019_m;
      const delta = gw.seasonal_delta_m ?? gw.pre_post_delta_m;
      const gwCategory = gw.category;
      const aquiferType = aquifer.type;
      const issuance = mgn.jobcard_issuance_pct ?? mgn.jobcard_issuance_rate_pc;
      const activation = mgn.worker_activation_pct ?? mgn.worker_activation_rate_pc;
      const women = mgn.women_participation_pct ?? mgn.women_participation_pc;

      const styles = `
        <style>
          :root{--muted:#6b7280;--accent:#0b5cff}
          body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;margin:0}
          .container{max-width:980px;margin:12px auto;padding:18px}
          header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #eef2f7;padding-bottom:10px}
          header h1{font-size:18px;margin:0}
          header .meta{font-size:12px;color:var(--muted)}
          .grid{display:block;margin-top:18px}
          .section{margin-bottom:12px}
          .heading{font-size:14px;font-weight:700;color:#0b376b;margin-bottom:8px}
          .sub{font-size:13px;font-weight:600;color:#1f2937;margin-bottom:6px}
          .card{padding:12px;border:1px solid #f1f5f9;border-radius:6px;background:#fff}
          .bullets{padding-left:18px;margin:8px 0}
          table{width:100%;border-collapse:collapse;font-size:13px}
          table td, table th{border:1px solid #eef2f7;padding:6px 8px}
          .small{font-size:12px;color:var(--muted)}
          a.source{color:var(--accent);text-decoration:none}
          @media print{ .grid{grid-template-columns:1fr 320px} }
        </style>`;

      const bullets = [];
      bullets.push(`Jal Jeevan Mission (JJM): Despite a "${gwCategory || '—'}" groundwater category, ${delta != null ? `a ${Number(delta) < 0 ? 'decline' : 'rise'} in seasonal groundwater levels (${fix(delta, 2)} m)` : 'seasonal variation'} necessitates strong source sustainability along with FHTC coverage.`);
      bullets.push(`MGNREGA: Leverage job card issuance ${pct(issuance)}, worker activation ${pct(activation)}, and women participation ${pct(women)} to deliver NRM works (afforestation, water harvesting).`);
      bullets.push(`DA-JGUA: With forest cover ${forestPct != null ? pct(forestPct) : '—'}, strengthen FRA, assess TMMC and expand SCD/Education outreach.`);
      if (delta != null) bullets.push(`Groundwater Management: Address seasonal delta ${fix(delta, 2)} m via rainwater harvesting and artificial recharge; tailor to ${aquiferType || 'local aquifer'} conditions.`);

      const rows = [];
      if (forestPct != null) rows.push(`<tr><td>Forest Cover</td><td>${pct(forestPct, 2)}</td></tr>`);
      if (lulc.cropland_percentage != null) rows.push(`<tr><td>Cropland</td><td>${pct(lulc.cropland_percentage, 2)}</td></tr>`);
      if (lulc.builtup_percentage != null) rows.push(`<tr><td>Built-up Area</td><td>${pct(lulc.builtup_percentage, 2)}</td></tr>`);
      if (preDepth != null) rows.push(`<tr><td>Pre-Monsoon Depth</td><td>${fix(preDepth, 2)} m</td></tr>`);
      if (delta != null) rows.push(`<tr><td>Seasonal Delta</td><td>${fix(delta, 2)} m</td></tr>`);
      if (gwCategory) rows.push(`<tr><td>Groundwater Category</td><td>${escapeHtml(gwCategory)}</td></tr>`);
      if (aquiferType) rows.push(`<tr><td>Aquifer Type</td><td>${escapeHtml(aquiferType)}</td></tr>`);
      if (issuance != null) rows.push(`<tr><td>Job Card Issuance Rate</td><td>${pct(issuance, 2)}</td></tr>`);
      if (activation != null) rows.push(`<tr><td>Worker Activation Rate</td><td>${pct(activation, 2)}</td></tr>`);
      if (women != null) rows.push(`<tr><td>Women Participation</td><td>${pct(women, 2)}</td></tr>`);
      if (mgn.jobcards_issued != null) rows.push(`<tr><td>Job Cards Issued</td><td>${num(mgn.jobcards_issued)}</td></tr>`);
      if (mgn.active_workers_total != null) rows.push(`<tr><td>Active Workers</td><td>${num(mgn.active_workers_total)}</td></tr>`);
      if (mgn.active_workers_women != null) rows.push(`<tr><td>Active Women Workers</td><td>${num(mgn.active_workers_women)}</td></tr>`);

      const notes = Array.isArray(meta.notes) ? meta.notes : [];
      const sources = Array.isArray(meta.data_sources) ? meta.data_sources : [];

      const annex = `
        <table>
          <thead><tr><th>Indicator</th><th>Value</th><th>Unit</th></tr></thead>
          <tbody>
            ${forestPct != null ? `<tr><td>Forest Cover</td><td>${fix(forestPct, 2)}</td><td>%</td></tr>` : ''}
            ${preDepth != null ? `<tr><td>Groundwater Pre‑Monsoon Depth</td><td>${fix(preDepth, 2)}</td><td>m</td></tr>` : ''}
            ${delta != null ? `<tr><td>Groundwater Seasonal Delta</td><td>${fix(delta, 2)}</td><td>m</td></tr>` : ''}
            ${gwCategory ? `<tr><td>Groundwater Category</td><td>${escapeHtml(gwCategory)}</td><td>—</td></tr>` : ''}
            ${aquiferType ? `<tr><td>Aquifer Type</td><td>${escapeHtml(aquiferType)}</td><td>—</td></tr>` : ''}
            ${issuance != null ? `<tr><td>MGNREGA Job Card Issuance Rate</td><td>${fix(issuance, 2)}</td><td>%</td></tr>` : ''}
            ${activation != null ? `<tr><td>MGNREGA Worker Activation Rate</td><td>${fix(activation, 2)}</td><td>%</td></tr>` : ''}
            ${women != null ? `<tr><td>MGNREGA Women Participation</td><td>${fix(women, 2)}</td><td>%</td></tr>` : ''}
            ${mgn.jobcards_issued != null ? `<tr><td>MGNREGA Job Cards Issued</td><td>${num(mgn.jobcards_issued)}</td><td>—</td></tr>` : ''}
            ${mgn.active_workers_total != null ? `<tr><td>MGNREGA Active Workers</td><td>${num(mgn.active_workers_total)}</td><td>—</td></tr>` : ''}
            ${mgn.active_workers_women != null ? `<tr><td>MGNREGA Active Women Workers</td><td>${num(mgn.active_workers_women)}</td><td>—</td></tr>` : ''}
          </tbody>
        </table>`;

      const sourceListHtml = (() => {
        if (!sources || !sources.length) return '<p class="small">Data sources not provided.</p>';
        const items = sources.map(s => {
          const n = normalizeSourceEntry(s);
          if (n.url) return `<li><a class="source" href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(n.label || findLabelForUrl(n.url))}</a></li>`;
          return `<li>${escapeHtml(n.label || n.raw)}</li>`;
        });
        return `<div class="card"><h3 class="small">Data Sources</h3><ul>${items.join('')}</ul></div>`;
      })();

      return `
        ${styles}
        <div class="container">
          <header>
            <div>
              <h1>DSS Recommendations – ${escapeHtml(village !== '—' ? village : (district !== '—' ? district : state))}, ${escapeHtml(state)}</h1>
              <div class="meta small">Date: ${escapeHtml((meta.generated_at || new Date().toISOString()).slice(0, 10))}</div>
            </div>
            <div class="small">Area: ${escapeHtml(areaTxt)}</div>
          </header>
          <div class="grid">
            <main>
              <div class="card">
                <h3 class="small">A. Header</h3>
                <p class="small">AOI: District: ${escapeHtml(district)}, State: ${escapeHtml(state)}</p>
                ${(aoi.centroid_lat != null && aoi.centroid_lon != null) ? `<p class="small">Centroid: ${Number(aoi.centroid_lat).toFixed(5)}, ${Number(aoi.centroid_lon).toFixed(5)}</p>` : ''}
              </div>
              <div class="card" style="margin-top:10px">
                <h3 class="small">B. Executive Summary</h3>
                <ul class="bullets">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
              </div>
              <div class="card" style="margin-top:10px">
                <h3 class="small">C. Context Snapshot</h3>
                <div>${rows.length ? `<table>${rows.join('')}</table>` : 'No key indicators available.'}</div>
                ${notes.length ? `<div class="small">${notes.map(n => escapeHtml(n)).join('<br/>')}</div>` : ''}
              </div>
              <div class="card" style="margin-top:10px">
                <h3 class="small">D. Scheme Recommendations</h3>
                <div class="small">
                  <h4 style="margin:6px 0 4px">Jal Jeevan Mission (JJM)</h4>
                  <p><strong>Focus:</strong> Functional Household Tap Connections (FHTC) & Source Sustainability</p>
                  <p class="small"><strong>Why:</strong> ${escapeHtml(gwCategory || '—')}${delta != null ? `, seasonal delta ${escapeHtml(fix(delta, 2))} m` : ''} — even where groundwater is currently classified as safe, declining seasonal trends indicate the need for proactive measures to secure drinking-water sources.</p>
                  <p class="small"><strong>What:</strong> Prioritize universal FHTC coverage; combine this with on-the-ground source-sustainability works such as check dams, percolation tanks, contour bunding, farm ponds, and targeted recharge interventions. Encourage household- and community-level rainwater harvesting.</p>
                  <p class="small"><strong>Where / How:</strong> Use topographic maps, hydrological flow-paths and existing waterbody layers to site recharge works in upper catchments and near habitations—prioritise areas showing larger seasonal declines or low FHTC coverage.</p>
                  <p class="small"><strong>Caveats:</strong> Shallow or shale aquifers may show slower recharge; pair recharge works with demand-management (efficiency, leak reduction) and surface-water options where appropriate.</p>
                </div>
                <div class="small" style="margin-top:8px">
                  <h4 style="margin:6px 0 4px">MGNREGA</h4>
                  <p class="small"><strong>Focus:</strong> Natural Resource Management (NRM) & Livelihood Enhancement</p>
                  <p class="small"><strong>Why:</strong> High job-card issuance and worker activation, together with significant women's participation and substantial forest cover, make MGNREGA a suitable delivery platform for large-scale NRM works.</p>
                  <p class="small"><strong>What:</strong> Prioritise NRM activities — afforestation, soil & moisture conservation (farm ponds, trenches), and construction of water-harvesting and recharge structures. Link these works with livelihood activities (horticulture, agroforestry, NTFP value-addition).</p>
                  <p class="small"><strong>Where / How:</strong> Target degraded forest patches, erosion-prone agricultural lands, and catchment areas identified from LULC maps, watershed boundaries, and village plans. Prioritise works that benefit marginalized groups including SC/ST households.</p>
                  <p class="small"><strong>Caveats:</strong> Ensure works are demand-driven, quality-checked and accompanied by timely wage payments to sustain participation and produce long-lasting assets.</p>
                </div>
                <div class="small" style="margin-top:8px">
                  <h4 style="margin:6px 0 4px">DA-JGUA (Development of Adivasi & Janjatiya Gram Udyog Abhiyan)</h4>
                  <p class="small"><strong>Focus:</strong> FRA strengthening, TMMC feasibility and SCD/education outreach</p>
                  <p class="small"><strong>Why:</strong> High forest cover and a substantial Scheduled Tribe population create both a need and opportunity to secure forest rights and promote forest-linked livelihoods.</p>
                  <p class="small"><strong>What:</strong> Intensify FRA implementation (IFR & CFR), carry out feasibility studies for Tribal Minor Mineral Concessions (TMMC) where geologically appropriate, and run targeted SCD/educational outreach to improve access and uptake of development programs.</p>
                  <p class="small"><strong>Where / How:</strong> Use forest boundary maps, habitation layers and traditional knowledge to identify CFR/IFR opportunities; consult geological maps for TMMC scoping; and plan outreach in tribal-dominated blocks and habitations.</p>
                  <p class="small"><strong>Caveats:</strong> FRA processes must be participatory and rights-respecting; TMMC requires strict environmental safeguards and benefit-sharing to avoid exploitation.</p>
                </div>
              </div>
            </main>
            <!-- Inline sections previously in aside; moved into the main single-column flow -->
            <section class="section">
              <div class="card">
                <div class="heading">E. Implementation & Convergence</div>
                <div class="small">
                  <p>Effective implementation requires strong inter-departmental convergence, clear leads and integrated planning at district and block levels. Below we outline recommended sectoral leads, convergence actions and operational guidance.</p>

                  <div class="sub">JJM (Lead: Public Health Engineering / Rural Water Supply)</div>
                  <p class="small"><strong>Convergence actions:</strong> Work with MGNREGA for earthworks, desilting and construction of recharge structures; coordinate with Forest Department/CAMPA for planting and catchment protection around sources; partner with Panchayati Raj Institutions for community mobilisation, operation & maintenance, and behaviour-change campaigns to promote water conservation.</p>
                  <p class="small"><strong>Operational guidance:</strong> Prepare village-level water security plans that map FHTC gaps, source vulnerability and priority recharge sites. Use MGNREGA funds for labor-intensive earthworks while assigning O&M responsibilities to local institutions.</p>

                  <div class="sub">MGNREGA (Lead: Rural Development Department)</div>
                  <p class="small"><strong>Convergence actions:</strong> Coordinate with Forest Department for afforestation and forest protection works; with Agriculture for soil & moisture conservation and farm-ponds; with Water Resources for larger structures and watershed development; and with Tribal Welfare to ensure works reach tribal communities.</p>
                  <p class="small"><strong>Operational guidance:</strong> Prioritise high-impact NRM packages that combine watershed works with livelihood components (horticulture, agroforestry). Ensure quality monitoring, geotagging of assets and timely wage payments to maintain participation.</p>

                  <div class="sub">DA-JGUA (Lead: Tribal Welfare Department)</div>
                  <p class="small"><strong>Convergence actions:</strong> Work with Forest Department for joint verification and CFR/IFR processing; collaborate with Mines & Geology for TMMC feasibility and compliance; partner with Education for targeted outreach and scholarships; and link with Skill Development for vocational training tied to local resources.</p>
                  <p class="small"><strong>Operational guidance:</strong> Conduct participatory mapping of forest-dwelling habitations, hold awareness camps for FRA claims, and ensure environmental impact assessments and equitable benefit-sharing for any mineral concessions.</p>

                  <div class="sub">Cross-cutting recommendations</div>
                  <ul class="bullets">
                    <li>Establish district-level convergence committees with nominated leads from each department and clear reporting lines.</li>
                    <li>Use GIS-driven prioritisation (LULC, watershed boundaries, habitations, service coverage) to allocate resources efficiently.</li>
                    <li>Institutionalise community participation (Panchayats, user groups) for O&M and local monitoring.</li>
                    <li>Ensure safeguards: environmental assessments for extractive proposals, gender- and social-inclusion checks, and transparent benefit-sharing mechanisms.</li>
                  </ul>
                </div>
              </div>
            </section>
            <section class="section">
              <div class="card">
                <div class="heading">F. Annexure</div>
                ${annex}
              </div>
            </section>
            <section class="section">
              ${sourceListHtml}
            </section>
          </div>
          </div>
        </div>`;
    } catch {
      return '<p>Unable to format report.</p>';
    }
  }

  // Build a minimal stub payload so we can always render "some" report
  function buildStubPayload(ctx = {}, note = '') {
    const now = new Date().toISOString();
    const { state = '', district = '', village = '' } = ctx || {};
    return {
      aoi: { state, district, village },
      meta: { generated_at: now, notes: note ? [String(note)] : [] },
      indicators: {}
    };
  }

  function pickFirst(attrs, candidates) {
    for (const k of candidates) {
      if (attrs && Object.prototype.hasOwnProperty.call(attrs, k)) return attrs[k];
    }
    return undefined;
  }

  // Try to extract an HTML report string from various upstream payload shapes
  function extractHtmlFromPayload(payload) {
    if (!payload) return null;
    // If string, return if looks like HTML or fenced code
    if (typeof payload === 'string') {
      const s = payload.trim();
      if (!s) return null;
      if (s.startsWith('<') || s.startsWith('```')) return s;
      // sometimes server returns a JSON string
      try { const p = JSON.parse(s); return extractHtmlFromPayload(p); } catch { }
      return null;
    }
    // If object, common locations
    const candidates = ['html', 'report_html', 'reportHtml', 'content', 'body', 'data', 'response'];
    for (const k of candidates) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) {
        const v = payload[k];
        if (typeof v === 'string') {
          const t = v.trim();
          if (t.startsWith('<') || t.startsWith('```')) return t;
        } else if (typeof v === 'object') {
          const found = extractHtmlFromPayload(v);
          if (found) return found;
        }
      }
    }
    // If payload looks like the expected report shape (has aoi or indicators), produce fallback HTML
    if (payload && (payload.aoi || payload.indicators || payload.meta)) {
      try { return renderDeterministicReport(payload); } catch { return null; }
    }
    return null;
  }

  function removeLayerGroup(baseId) {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    const sub = ['-fill', '-outline', '-line', '-circle', '-label'];
    sub.forEach((s) => {
      const id = `${baseId}${s}`;
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) { }
    });
    try { if (map.getLayer(baseId)) map.removeLayer(baseId); } catch (_) { }
    try { if (map.getSource(baseId)) map.removeSource(baseId); } catch (_) { }
  }

  function removeVillageBoundary() {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    const layers = ['dss-village-boundary-fill', 'dss-village-boundary-outline'];
    layers.forEach((lid) => { try { if (map.getLayer(lid)) map.removeLayer(lid); } catch (_) { } });
    try { if (map.getSource('dss-village-boundary')) map.removeSource('dss-village-boundary'); } catch (_) { }
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
        unloadHandler = () => { try { map.remove(); } catch { } };
        window.addEventListener('beforeunload', unloadHandler);
      }
      return () => { };
    }
    const cleanup = init();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (ro) try { ro.disconnect(); } catch { }
      if (!import.meta.env.DEV) {
        // Production: safe to remove on unmount
        const m = mapRef.current; if (m) { try { m.remove(); } catch { } mapRef.current = null; }
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
        if (!cancelled) setDistrictOptions(Array.from(out).sort((a, b) => a.localeCompare(b)));
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
          where: `(State_Name='${(STATE_LABEL_TO_CODE[stateSel] || stateSel).replace(/'/g, "''")}') OR (State_FSI='${String(stateSel).replace(/'/g, "''")}')`,
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
            try { map.moveLayer('dss-districts-selected-fill'); } catch (_) { }
          }
          if (map.getLayer('dss-districts-selected-outline')) {
            map.setPaintProperty('dss-districts-selected-outline', 'line-color', '#d97706');
            map.setPaintProperty('dss-districts-selected-outline', 'line-width', 2.0);
            try { map.moveLayer('dss-districts-selected-outline'); } catch (_) { }
          }
          try { map.moveLayer('dss-districts-selected-label'); } catch (_) { }
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
        setVillages(Array.from(names).sort((a, b) => a.localeCompare(b)));
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
    const fetchId = Date.now();
    const controller = new AbortController();
    const timeoutMs = 15000; // client-side timeout mirrors server default
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const upstreamBase = 'https://fra-report-generator-375005976373.europe-west1.run.app/report';
      const qs = new URLSearchParams();
      qs.set('state', stateSel);
      if (districtSel) qs.set('district', districtSel);
      if (villageSel) qs.set('village', villageSel);
      const upstreamUrl = `${upstreamBase}?${qs.toString()}`;
      // Hit proxy (same-origin in prod). Add cache buster param if user has toggled selections quickly.
      const proxyUrl = `${baseUrl}/api/report?${qs.toString()}`;

      const resp = await fetch(proxyUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`Report fetch failed: HTTP ${resp.status}`);
      const contentType = resp.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await resp.json();
      } else {
        data = await resp.text();
      }
      // Guard against race: if user changed state/district mid-fetch, we bail
      if (stateSel !== qs.get('state') || districtSel !== (qs.get('district') || '') || villageSel !== (qs.get('village') || '')) {
        return; // stale
      }
      setReportData({ url: upstreamUrl, data, contentType });

      if ((contentType.includes('application/json') || typeof data === 'object') && data) {
        let immediate = renderDeterministicReport(data, { state: stateSel, district: districtSel, village: villageSel });
        if (immediate && immediate.startsWith('```')) {
          immediate = immediate.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
        }
        setReportHtml(immediate);
        setReportError('');

        // Enhance via server formatter (ignore errors)
        (async () => {
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
                if (improved.startsWith('```')) improved = improved.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
                // Ensure still same selection
                if (stateSel === qs.get('state') && districtSel === (qs.get('district') || '') && villageSel === (qs.get('village') || '')) {
                  setReportHtml(improved);
                }
              }
            }
          } catch (err) {
            console.warn('Formatter enhance failed:', err?.message || err);
          }
        })();
      } else {
        // Non-JSON response (e.g., plain text). Ensure we still have a
        // renderable report by creating a stub based on current selection.
        const stub = buildStubPayload({ state: stateSel, district: districtSel, village: villageSel }, 'Upstream returned non-JSON content. Showing fallback.');
        const immediate = renderDeterministicReport(stub, { state: stateSel, district: districtSel, village: villageSel });
        if (immediate) setReportHtml(immediate.startsWith('```') ? immediate.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '') : immediate);
      }
    } catch (e) {
      // Always surface a report, even on timeout or network failure
      const note = (e?.name === 'AbortError')
        ? `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for report.`
        : (e?.message || 'Failed to fetch report');
      setReportError('');
      console.warn('Report fetch error, using fallback:', note);
      const stub = buildStubPayload({ state: stateSel, district: districtSel, village: villageSel }, note);
      setReportData({ url: 'fallback://offline', data: stub, contentType: 'application/json' });
      try {
        let immediate = renderDeterministicReport(stub, { state: stateSel, district: districtSel, village: villageSel });
        if (immediate && immediate.startsWith('```')) {
          immediate = immediate.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
        }
        setReportHtml(immediate || '<p>Unable to render fallback.</p>');
      } catch (_) {
        setReportHtml('<p>Unable to render fallback.</p>');
      }
    } finally {
      clearTimeout(timer);
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
              {reportLoading ? 'Generating report…' : 'Get Report'}
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
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <h4 className="text-base font-semibold text-gray-900">Report</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (!stateSel) return;
                if (!reportData) return;
                try {
                  setPdfLoading(true);
                  const payload = {
                    html: reportHtml && reportHtml.trim() ? reportHtml : undefined,
                    data: (!reportHtml || !reportHtml.trim()) ? reportData.data : undefined,
                    context: { state: stateSel, district: districtSel, village: villageSel }
                  };
                  const resp = await fetch(`${baseUrl}/api/report/pdf`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  });
                  if (!resp.ok) {
                    const t = await resp.text();
                    throw new Error(`PDF failed: ${resp.status} ${t?.slice(0, 200)}`);
                  }
                  const blob = await resp.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  const filename = [stateSel, districtSel, villageSel].filter(Boolean).join('_').replace(/\s+/g, '_').toLowerCase() || 'dss_report';
                  a.href = url;
                  a.download = `${filename}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                } catch (e) {
                  setReportError(e?.message || 'Failed to download PDF');
                } finally {
                  setPdfLoading(false);
                }
              }}
              disabled={!reportData || pdfLoading || reportLoading}
              className="px-2.5 py-1.5 rounded-md text-xs bg-emerald-600 text-white disabled:opacity-50"
            >
              {pdfLoading ? 'Preparing PDF��' : 'Download PDF'}
            </button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto h-[710px]">
          {!stateSel && (
            <div className="text-sm text-gray-600">Select at least a State and click "Fetch Data".</div>
          )}
          {reportLoading && (<ReportSkeleton />)}
          {reportError && (
            <div className="text-sm text-red-600">{reportError}</div>
          )}
          {!reportLoading && !reportError && reportData && (
            <div className="text-sm">
              {(() => {
                // Prefer server-provided HTML if present
                const extracted = extractHtmlFromPayload(reportData.data);
                if (extracted && typeof extracted === 'string') {
                  const html = extracted.startsWith('```') ? extracted.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '') : extracted;
                  return <div className="prose prose-sm max-w-none bg-white rounded-lg border shadow-sm p-4" dangerouslySetInnerHTML={{ __html: html }} />;
                }
                // Fallback to client-side formatted HTML if available
                if (reportHtml) {
                  return <div className="prose prose-sm max-w-none bg-white rounded-lg border shadow-sm p-4" dangerouslySetInnerHTML={{ __html: reportHtml }} />;
                }
                // Otherwise show raw JSON or text with hint
                if (String(reportData.contentType || '').includes('application/json') || typeof reportData.data === 'object') {
                  return (
                    <div>
                      <div className="mb-2 text-xs text-gray-500">Formatted HTML not available — showing raw JSON below for inspection.</div>
                      <pre className="text-xs bg-gray-50 border rounded p-3 whitespace-pre-wrap break-words">{JSON.stringify(reportData.data, null, 2)}</pre>
                    </div>
                  );
                }
                return <pre className="text-xs bg-gray-50 border rounded p-3 whitespace-pre-wrap break-words">{String(reportData.data || '')}</pre>;
              })()}
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

