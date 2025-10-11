import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
// NOTE: puppeteer and serverless chromium are imported dynamically inside the /pdf handler
// to avoid ESM import-time crashes when the packages are not installed in a dev environment.

// Simple in-memory cache for upstream report responses (avoid refetch churn)
// Keyed by state|district|village. Each entry: { ts, status, contentType, body, isJson }
// TTL configurable via env (ms), default 5 minutes.
const REPORT_CACHE = new Map();
const REPORT_CACHE_TTL = Number(process.env.REPORT_CACHE_TTL_MS || 5 * 60 * 1000);
function cacheKey({ state, district, village }) {
  return [state||'', district||'', village||''].join('|');
}
function getCached(params) {
  const key = cacheKey(params);
  const hit = REPORT_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > REPORT_CACHE_TTL) { REPORT_CACHE.delete(key); return null; }
  return hit;
}
function setCached(params, value) {
  try { REPORT_CACHE.set(cacheKey(params), { ...value, ts: Date.now() }); } catch {}
}

const router = Router();

// Proxy endpoint
router.get('/', async (req, res) => {
  const started = Date.now();
  const { state, district, village, noCache } = req.query || {};
  try {
    if (!state || String(state).trim() === '') {
      return res.status(400).json({ error: 'Missing required parameter: state' });
    }
    const params = { state: String(state).trim(), district: district ? String(district).trim() : '', village: village ? String(village).trim() : '' };
    if (!noCache) {
      const cached = getCached(params);
      if (cached) {
        res.setHeader('x-cache', 'HIT');
        res.status(cached.status);
        res.setHeader('Content-Type', cached.contentType);
        return cached.isJson ? res.json(cached.body) : res.send(cached.body);
      }
    }
  res.setHeader('x-cache', 'MISS');
  // Default upstream switched to nearest region (asia-south2). Can be overridden via env.
  const base = process.env.REPORT_UPSTREAM_BASE || 'https://fra-report-generator-375005976373.asia-south2.run.app/report';
    const qs = new URLSearchParams();
    qs.set('state', params.state);
    if (params.district) qs.set('district', params.district);
    if (params.village) qs.set('village', params.village);
    const url = `${base}?${qs.toString()}`;

    // Upstream fetch with timeout + abort and finer-grained timing
    const timeoutMs = Number(process.env.REPORT_UPSTREAM_TIMEOUT_MS || 15000);
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = Date.now();
    let upstream;
    try {
      upstream = await fetch(url, { signal: controller.signal });
    } catch (err) {
      if (err?.name === 'AbortError') {
        return res.status(504).json({ error: `Upstream timeout after ${timeoutMs}ms` });
      }
      throw err;
    } finally {
      clearTimeout(to);
    }
    const tAfterHeaders = Date.now();

    const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    const status = upstream.status;
    res.status(status);
    res.setHeader('Content-Type', contentType);
    if (contentType.includes('application/json')) {
      let data, sizeBytes = 0;
      try {
        const jsonText = await upstream.text();
        sizeBytes = Buffer.byteLength(jsonText, 'utf8');
        try { data = JSON.parse(jsonText); } catch (e) { data = { error: 'Invalid JSON from upstream', detail: (e?.message||e) }; }
      } catch (e) {
        data = { error: 'Failed to read upstream body', detail: (e?.message||e) };
      }
      const tAfterBody = Date.now();
      const body = { url, ...data };
      // Cache JSON body
      setCached(params, { status, contentType, body, isJson: true });
      // Detailed logging
      const dnsConnect = tAfterHeaders - t0;
      const bodyTime = tAfterBody - tAfterHeaders;
      const total = tAfterBody - t0;
      console.info(`[report] upstream timing ms total=${total} headers=${dnsConnect} body=${bodyTime} size=${sizeBytes} state=${params.state} district=${params.district} village=${params.village} status=${status}`);
      if (total > (Number(process.env.REPORT_SLOW_THRESHOLD_MS || 8000))) console.warn(`[report] slow proxy ${total}ms state=${params.state} district=${params.district} village=${params.village}`);
      return res.json(body);
    } else {
      const text = await upstream.text();
      const sizeBytes = Buffer.byteLength(String(text || ''), 'utf8');
      const tAfterBody = Date.now();
      setCached(params, { status, contentType, body: text, isJson: false });
      const dnsConnect = tAfterHeaders - t0;
      const bodyTime = tAfterBody - tAfterHeaders;
      const total = tAfterBody - t0;
      console.info(`[report] upstream timing ms total=${total} headers=${dnsConnect} body=${bodyTime} size=${sizeBytes} state=${params.state} district=${params.district} village=${params.village} status=${status}`);
      if (total > (Number(process.env.REPORT_SLOW_THRESHOLD_MS || 8000))) console.warn(`[report] slow proxy ${total}ms state=${params.state} district=${params.district} village=${params.village}`);
      return res.send(text);
    }
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'Failed to fetch report' });
  } finally {
    const ms = Date.now() - started;
    if (ms > 8000) console.warn(`[report] slow proxy ${ms}ms state=${state} district=${district} village=${village}`);
  }
});

// Lightweight server-side HTML fallback used by /pdf when Gemini HTML is unavailable
function formatHtmlFallbackServer(json, ctx = {}) {
  try {
    const data = typeof json === 'object' ? json : JSON.parse(String(json || '{}'));
    const aoi = data.aoi || {};
    const meta = data.meta || {};
    const ind = data.indicators || {};
    const state = ctx.state || aoi.state || '—';
    const district = ctx.district || aoi.district || '—';
    const village = ctx.village || aoi.village || '—';
    const areaRaw = aoi.area_sqkm ?? aoi.geographic_area_sqkm;
    let areaTxt = '—';
    if (typeof areaRaw === 'number') areaTxt = `${areaRaw.toFixed(2)} km²`;
    else if (typeof areaRaw === 'string' && !isNaN(Number(areaRaw))) areaTxt = `${Number(areaRaw).toFixed(2)} km²`;

    const pct = (v) => (v == null || isNaN(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`);
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
    const baseStyles = `
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111827; }
        h2 { font-size: 20px; margin: 0 0 8px; }
        h3 { font-size: 16px; margin: 16px 0 8px; }
        p { margin: 0 0 12px; color:#374151; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        td { border: 1px solid #e5e7eb; padding: 6px 8px; }
      </style>`;

    return `<!doctype html><html><head><meta charset="utf-8"/>${baseStyles}</head><body>
      <section>
        <h2>DSS Recommendations – ${village !== '—' ? village : (district !== '—' ? district : state)}, ${state}</h2>
        <p>AOI: State ${state} · District ${district} · Village ${village} · Area ${areaTxt}</p>
      </section>
      <section>
        <h3>Context Snapshot</h3>
        <table>
          <tbody>
            ${rows.join('') || '<tr><td colspan="2">No key indicators available.</td></tr>'}
          </tbody>
        </table>
        ${notes.length ? `<p>Notes: ${notes.join('; ')}</p>` : ''}
      </section>
    </body></html>`;
  } catch {
    return '<p>Unable to format report.</p>';
  }
}

// Deterministic, sectioned HTML formatter (A–F) used when Gemini is unavailable
// Helper mappings and functions for data-source display
const DATA_SOURCE_LABELS = {
  'services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary': 'State boundary (FeatureServer)',
  'services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary': 'District boundary (FeatureServer)',
  'livingatlas.esri.in/server/rest/services/IAB2024/IAB_Village_2024': 'Village (IAB2024) MapServer',
  'livingatlas.esri.in/server1/rest/services/Water/Pre_Post_Monsoon_Water_Level_Depth/FeatureServer/1': 'Groundwater Pre-monsoon (FeatureServer/1)',
  'livingatlas.esri.in/server1/rest/services/Water/Pre_Post_Monsoon_Water_Level_Depth/FeatureServer/2': 'Groundwater During-monsoon (FeatureServer/2)',
  'livingatlas.esri.in/server1/rest/services/Water/Pre_Post_Monsoon_Water_Level_Depth/FeatureServer/3': 'Groundwater Post-monsoon (FeatureServer/3)',
  'livingatlas.esri.in/server1/rest/services/Water/Major_Aquifers/MapServer/0': 'Major Aquifers (MapServer/0)',
  'livingatlas.esri.in/server1/rest/services/PMGSY/IN_PMGSY_RuralFacilities_2021/MapServer/0': 'PMGSY Rural Facilities (MapServer/0)',
  'livingatlas.esri.in/server1/rest/services/MGNREGA/IN_DT_CategoryWiseHHWorkers/MapServer/0': 'MGNREGA workers (MapServer/0)'
};

const SHORT_SOURCE_LABELS = {
  state: 'State boundary',
  district: 'District boundary',
  village: 'Village (IAB2024)',
  groundwater_pre_monsoon: 'Groundwater (Pre-monsoon)',
  groundwater_during_monsoon: 'Groundwater (During-monsoon)',
  groundwater_post_monsoon: 'Groundwater (Post-monsoon)',
  aquifer: 'Aquifer',
  rural_facilities: 'PMGSY Rural Facilities',
  mgnrega_workers: 'MGNREGA workers'
};

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function findLabelForUrl(u) {
  try {
    const s = String(u || '');
    const key = Object.keys(DATA_SOURCE_LABELS).find(k => s.includes(k));
    if (key) return DATA_SOURCE_LABELS[key];
    const url = new URL(s);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return parts.slice(-2).join('/');
    return url.hostname;
  } catch {
    return String(u || '').slice(0, 60);
  }
}

function normalizeSourceEntry(entry) {
  if (entry == null) return { label: '', url: '', raw: '' };
  if (typeof entry === 'object') {
    const keys = Object.keys(entry);
    if (keys.length === 1 && typeof entry[keys[0]] === 'string') {
      const k = keys[0];
      const url = entry[k];
      const label = SHORT_SOURCE_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1));
      return { label, url, raw: url };
    }
    const url = entry.url || entry.link || entry.source || null;
    const label = entry.label || entry.name || (url ? findLabelForUrl(url) : JSON.stringify(entry));
    return { label, url, raw: url || JSON.stringify(entry) };
  }
  const s = String(entry).trim();
  const kv = s.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(https?:\/\/\S+)$/i) || s.match(/^([a-zA-Z0-9_\-]+)\s*:\s*(\S+)$/i);
  if (kv) {
    const key = kv[1];
    const val = kv[2];
    const label = SHORT_SOURCE_LABELS[key] || key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    return { label, url: val, raw: val };
  }
  if (/^https?:\/\//i.test(s)) {
    return { label: findLabelForUrl(s), url: s, raw: s };
  }
  return { label: s, url: '', raw: s };
}

function formatHtmlDeterministicServer(json, ctx = {}) {
  try {
    const data = typeof json === 'object' ? json : JSON.parse(String(json || '{}'));
    const aoi = data.aoi || {};
    const meta = data.meta || {};
    const ind = data.indicators || {};
    const state = (ctx.state || aoi.state || '').trim() || '—';
    const district = (ctx.district || aoi.district || '').trim() || '—';
    const village = (ctx.village || aoi.village || '').trim() || '—';

    const rawArea = aoi.area_sqkm ?? aoi.geographic_area_sqkm ?? aoi?.additional_attributes?.area_sqkm;
    let areaKm2 = null;
    if (typeof rawArea === 'number') areaKm2 = rawArea > 1e7 ? rawArea/1e6 : rawArea;
    else if (typeof rawArea === 'string' && !isNaN(Number(rawArea))) { const n = Number(rawArea); areaKm2 = n>1e7 ? n/1e6 : n; }
    const areaTxt = areaKm2 != null ? `${areaKm2.toFixed(2)} km²` : '—';

    const pct=(v,d=2)=>(v==null||isNaN(Number(v))?'—':`${Number(v).toFixed(d)}%`);
    const num=(v)=>(v==null||isNaN(Number(v))?'—':Number(v).toLocaleString('en-IN'));
    const fix=(v,d=2)=>(v==null||isNaN(Number(v))?'—':Number(v).toFixed(d));

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
        :root{--muted:#6b7280;--accent:#0b5cff;--bg:#ffffff}
        html,body{height:100%;margin:0;padding:0;background:var(--bg);color:#111827;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial}
        .container{max-width:960px;margin:18px auto;padding:20px;border:1px solid #e6e9ee;border-radius:8px;background:#fff}
        header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eef2f7;padding-bottom:12px;margin-bottom:12px}
        header h1{font-size:18px;margin:0;color:#0f172a}
        header .meta{font-size:12px;color:var(--muted)}
        .grid{display:grid;grid-template-columns:1fr 360px;gap:18px}
        .card{padding:12px;border:1px solid #f1f5f9;border-radius:6px;background:#fbfdff}
        h2.section-title{font-size:15px;margin:0 0 6px;color:#0b4cca}
        h3{font-size:14px;margin:8px 0;color:#0f172a}
        p.lead{margin:6px 0;color:var(--muted);font-size:13px}
        ul.bullets{padding-left:18px;margin:8px 0}
        ul.bullets li{margin:6px 0}
        table.indicators{width:100%;border-collapse:collapse;margin-top:6px}
        table.indicators th, table.indicators td{border:1px solid #eef2f7;padding:6px 8px;font-size:13px}
        .small{font-size:12px;color:var(--muted)}
        .sources ul{list-style:none;padding-left:0;margin:0}
        .sources li{margin:6px 0}
        a.source{color:#0b5cff;text-decoration:none}
        @media print{ .grid{grid-template-columns:1fr 360px} .container{border:none} }
      </style>`;

    const bullets=[];
    bullets.push(`Jal Jeevan Mission (JJM): Despite a "${gwCategory||'—'}" groundwater category, ${delta!=null?`a ${Number(delta)<0?'decline':'rise'} in seasonal groundwater levels (${fix(delta,2)} m)`:'seasonal variation'} necessitates strong source sustainability along with FHTC coverage.`);
    bullets.push(`MGNREGA: Leverage job card issuance ${pct(issuance)}, worker activation ${pct(activation)}, and women participation ${pct(women)} to deliver NRM works (afforestation, water harvesting).`);
    bullets.push(`DA-JGUA: With forest cover ${forestPct!=null?pct(forestPct):'—'}, strengthen FRA (IFR/CFR), assess TMMC, and expand SCD/Education outreach.`);
    if (delta!=null) bullets.push(`Groundwater Management: Address seasonal delta ${fix(delta,2)} m via rainwater harvesting and artificial recharge; tailor to ${aquiferType||'local aquifer'} conditions.`);

    const rows=[];
    if (forestPct!=null) rows.push(`<tr><td>Forest Cover</td><td>${pct(forestPct,2)}</td></tr>`);
    if (lulc.cropland_percentage!=null) rows.push(`<tr><td>Cropland</td><td>${pct(lulc.cropland_percentage,2)}</td></tr>`);
    if (lulc.builtup_percentage!=null) rows.push(`<tr><td>Built-up Area</td><td>${pct(lulc.builtup_percentage,2)}</td></tr>`);
    if (preDepth!=null) rows.push(`<tr><td>Pre-Monsoon Depth</td><td>${fix(preDepth,2)} m</td></tr>`);
    if (delta!=null) rows.push(`<tr><td>Seasonal Delta</td><td>${fix(delta,2)} m (${Number(delta)<0?'Decline':'Shallower'})</td></tr>`);
    if (gwCategory) rows.push(`<tr><td>Groundwater Category</td><td>${gwCategory}</td></tr>`);
    if (aquiferType) rows.push(`<tr><td>Aquifer Type</td><td>${aquiferType}</td></tr>`);
    if (issuance!=null) rows.push(`<tr><td>Job Card Issuance Rate</td><td>${pct(issuance,2)}</td></tr>`);
    if (activation!=null) rows.push(`<tr><td>Worker Activation Rate</td><td>${pct(activation,2)}</td></tr>`);
    if (women!=null) rows.push(`<tr><td>Women Participation</td><td>${pct(women,2)}</td></tr>`);
    if (mgn.jobcards_issued!=null) rows.push(`<tr><td>Job Cards Issued</td><td>${num(mgn.jobcards_issued)}</td></tr>`);
    if (mgn.active_workers_total!=null) rows.push(`<tr><td>Active Workers</td><td>${num(mgn.active_workers_total)}</td></tr>`);
    if (mgn.active_workers_women!=null) rows.push(`<tr><td>Active Women Workers</td><td>${num(mgn.active_workers_women)}</td></tr>`);

    const notes=Array.isArray(meta.notes)?meta.notes:[];
    const sources=Array.isArray(meta.data_sources)?meta.data_sources:[];
    const annex = `
      <table class="indicators">
        <thead><tr><th>Indicator</th><th>Value</th><th>Unit</th></tr></thead>
        <tbody>
          ${forestPct!=null?`<tr><td>Forest Cover</td><td>${fix(forestPct,2)}</td><td>%</td></tr>`:''}
          ${preDepth!=null?`<tr><td>Groundwater Pre‑Monsoon Depth</td><td>${fix(preDepth,2)}</td><td>m</td></tr>`:''}
          ${delta!=null?`<tr><td>Groundwater Seasonal Delta</td><td>${fix(delta,2)}</td><td>m</td></tr>`:''}
          ${gwCategory?`<tr><td>Groundwater Category</td><td>${gwCategory}</td><td>—</td></tr>`:''}
          ${aquiferType?`<tr><td>Aquifer Type</td><td>${aquiferType}</td><td>—</td></tr>`:''}
          ${issuance!=null?`<tr><td>MGNREGA Job Card Issuance Rate</td><td>${fix(issuance,2)}</td><td>%</td></tr>`:''}
          ${activation!=null?`<tr><td>MGNREGA Worker Activation Rate</td><td>${fix(activation,2)}</td><td>%</td></tr>`:''}
          ${women!=null?`<tr><td>MGNREGA Women Participation</td><td>${fix(women,2)}</td><td>%</td></tr>`:''}
          ${mgn.jobcards_issued!=null?`<tr><td>MGNREGA Job Cards Issued</td><td>${num(mgn.jobcards_issued)}</td><td>—</td></tr>`:''}
          ${mgn.active_workers_total!=null?`<tr><td>MGNREGA Active Workers</td><td>${num(mgn.active_workers_total)}</td><td>—</td></tr>`:''}
          ${mgn.active_workers_women!=null?`<tr><td>MGNREGA Active Women Workers</td><td>${num(mgn.active_workers_women)}</td><td>—</td></tr>`:''}
        </tbody>
      </table>`;

    const sourceList = (() => {
      if (!sources || !sources.length) return '<p class="small muted">Data sources not provided.</p>';
      const items = sources.map(s => {
        const n = normalizeSourceEntry(s);
        if (n.url) return `<li><a class="source" href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(n.label || findLabelForUrl(n.url))}</a></li>`;
        return `<li>${escapeHtml(n.label || n.raw)}</li>`;
      });
      return `<div class="sources card"><h3 class="small">Data Sources</h3><ul>${items.join('')}</ul></div>`;
    })();

    return `<!doctype html><html><head><meta charset="utf-8"/>${styles}</head><body>
      <div class="container">
        <header>
          <div>
            <h1>DSS Recommendations – ${escapeHtml(village !== '—' ? village : (district !== '—' ? district : state))}, ${escapeHtml(state)}</h1>
            <div class="meta small">Date: ${escapeHtml((meta.generated_at || new Date().toISOString()).slice(0,10))}</div>
          </div>
          <div class="small">Area: ${escapeHtml(areaTxt)}</div>
        </header>

        <div class="grid">
          <main>
            <section class="card">
              <h2 class="section-title">A. Header</h2>
              <p class="lead">Area of Interest (AOI): District: ${escapeHtml(district)}, State: ${escapeHtml(state)}</p>
              ${ (aoi.centroid_lat!=null && aoi.centroid_lon!=null) ? `<p class="small">Centroid: ${Number(aoi.centroid_lat).toFixed(5)}, ${Number(aoi.centroid_lon).toFixed(5)}</p>` : ''}
            </section>

            <section class="card" style="margin-top:12px">
              <h2 class="section-title">B. Executive Summary</h2>
              <ul class="bullets">${bullets.map(b=>`<li>${escapeHtml(b)}</li>`).join('')}</ul>
            </section>

            <section class="card" style="margin-top:12px">
              <h2 class="section-title">C. Context Snapshot</h2>
              <h3>Land Use / LULC</h3>
              <p class="small"><strong>Forest Cover:</strong> ${forestPct!=null?escapeHtml(fix(forestPct,2))+'%':'—'}</p>
              <p class="small"><strong>Cropland:</strong> ${lulc.cropland_percentage!=null?escapeHtml(fix(lulc.cropland_percentage,2))+'%':'—'}</p>
              <p class="small"><strong>Built-up:</strong> ${lulc.builtup_percentage!=null?escapeHtml(fix(lulc.builtup_percentage,2))+'%':'—'}</p>
              <h3 style="margin-top:8px">Groundwater</h3>
              <p class="small"><strong>Pre-Monsoon Depth:</strong> ${preDepth!=null?escapeHtml(fix(preDepth,2))+' m':'—'}</p>
              <p class="small"><strong>Seasonal Delta (Pre-Post):</strong> ${delta!=null?escapeHtml(fix(delta,2))+' m':''} ${delta!=null?`(${Number(delta)<0?'Decline observed':'Rise observed'})`:''}</p>
              <p class="small"><strong>Category:</strong> ${escapeHtml(gwCategory || '—')}</p>
              <p class="small"><strong>Aquifer Type:</strong> ${escapeHtml(aquiferType || '—')}</p>

              <h3 style="margin-top:8px">MGNREGA Performance</h3>
              <table class="indicators"><tbody>
                <tr><td>Job Card Issuance Rate</td><td>${issuance!=null?escapeHtml(fix(issuance,2))+'%':'—'}</td></tr>
                <tr><td>Worker Activation Rate</td><td>${activation!=null?escapeHtml(fix(activation,2))+'%':'—'}</td></tr>
                <tr><td>Women Participation</td><td>${women!=null?escapeHtml(fix(women,2))+'%':'—'}</td></tr>
                <tr><td>Total Job Cards Issued</td><td>${mgn.jobcards_issued!=null?escapeHtml(num(mgn.jobcards_issued)):'—'}</td></tr>
                <tr><td>Total Active Workers</td><td>${mgn.active_workers_total!=null?escapeHtml(num(mgn.active_workers_total)):'—'}</td></tr>
                <tr><td>Active Women Workers</td><td>${mgn.active_workers_women!=null?escapeHtml(num(mgn.active_workers_women)):'—'}</td></tr>
              </tbody></table>

              ${notes.length ? `<div style="margin-top:8px"><strong>Notes:</strong><div class="small">${notes.map(n=>escapeHtml(n)).join('<br/>')}</div></div>` : ''}
            </section>

            <section class="card" style="margin-top:12px">
              <h2 class="section-title">D. Scheme Recommendations</h2>
              <h3>Jal Jeevan Mission (JJM)</h3>
              <p><strong>Focus:</strong> Functional Household Tap Connections & Source Sustainability</p>
              <p class="small"><strong>Why:</strong> ${escapeHtml(gwCategory||'—')}${delta!=null?`, seasonal delta ${escapeHtml(fix(delta,2))} m`:''}</p>
              <p class="small"><strong>What:</strong> Prioritize FHTC coverage, water harvesting, check dams, percolation tanks, and rainwater harvesting.</p>
              <p class="small"><strong>Where/How:</strong> Upper catchments, near habitations and water bodies using LULC and flow path layers.</p>

              <h3 style="margin-top:8px">MGNREGA</h3>
              <p class="small"><strong>Focus:</strong> NRM & Livelihood Enhancement</p>
              <p class="small">Channel MGNREGA efforts into afforestation, soil & moisture conservation, and water harvesting linked to livelihood activities.</p>

              <h3 style="margin-top:8px">DA-JGUA</h3>
              <p class="small"><strong>Focus:</strong> FRA strengthening, TMMC feasibility, and SCD/Education outreach</p>
            </section>

            <section class="card" style="margin-top:12px">
              <h2 class="section-title">E. Implementation & Convergence</h2>
              <ul class="bullets small">
                <li><strong>JJM (Lead: PHED/RWS):</strong> Converge with MGNREGA for earthwork and CAMPA for afforestation.</li>
                <li><strong>MGNREGA (Lead: RD):</strong> Align NRM works to watershed plans and converge with Forest & Agriculture.</li>
                <li><strong>DA-JGUA (Lead: Tribal Welfare):</strong> Joint FRA verification and TMMC feasibility with Mines & Geology.</li>
              </ul>
            </section>
          </main>

          <aside>
            <div class="card">
              <h3 class="small">F. Annexure</h3>
              ${annex}
            </div>
            <div style="margin-top:12px">${sourceList}</div>
          </aside>
        </div>
      </div>
    </body></html>`;
  } catch {
    return '<p>Unable to format report.</p>';
  }
}

// Generate PDF for the current report
router.post('/pdf', async (req, res) => {
  const started = Date.now();
  try {
    const { data, context, html: htmlFromClient } = req.body || {};
    if (!data && !htmlFromClient) return res.status(400).json({ error: 'Missing data or html' });

    // Build HTML
    let html = '';
    if (typeof htmlFromClient === 'string' && htmlFromClient.trim()) {
      html = htmlFromClient.trim();
    } else if (data) {
      try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
        if (apiKey) {
          const prompt = buildGeminiPrompt(data, context || {});
          const modelId = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: modelId });
          const resp = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }]}],
            generationConfig: { temperature: 0.2, topP: 0.9, topK: 40, maxOutputTokens: 6000 }
          });
          html = resp?.response?.text?.() || resp?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      } catch (gemErr) {
        // Log but continue to fallback
        console.warn('[report/pdf] Gemini generation failed, using fallback:', gemErr?.message || gemErr);
      }
      if (!html || !html.trim()) html = formatHtmlDeterministicServer(data, context || {});
    }
    if (html.trim().startsWith('```')) html = html.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');

    // Attempt PDF generation using a best-effort sequence of strategies.
    // We dynamically import packages so missing deps don't crash the server on import.
    const isServerless = !!(process.env.VERCEL || process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV);
    let browser = null;
    let pdfBuffer = null;
    let lastError = null;

    // Helper to try launching with provided launcher function
    async function tryLaunch(launchFn) {
      try {
        const b = await launchFn();
        return b;
      } catch (err) {
        lastError = err;
        return null;
      }
    }

    // Strategy 1: puppeteer-core + @sparticuz/chromium (serverless-friendly)
    if (!browser) {
      try {
        const puppeteerCore = (await import('puppeteer-core')).default;
        const spart = await import('@sparticuz/chromium');
        const execPath = await spart.executablePath();
        browser = await tryLaunch(() => puppeteerCore.launch({ args: spart.args || ['--no-sandbox', '--disable-setuid-sandbox'], executablePath: execPath, headless: spart.headless ?? true, defaultViewport: spart.defaultViewport }));
      } catch (e) {
        lastError = e;
      }
    }

    // Strategy 2: puppeteer-core + chrome-aws-lambda
    if (!browser) {
      try {
        const puppeteerCore = (await import('puppeteer-core')).default;
        const cal = await import('chrome-aws-lambda');
        const execPath = cal.executablePath;
        browser = await tryLaunch(() => puppeteerCore.launch({ args: cal.args || ['--no-sandbox', '--disable-setuid-sandbox'], executablePath: execPath, headless: cal.headless ?? true, defaultViewport: cal.defaultViewport }));
      } catch (e) {
        lastError = e;
      }
    }

    // Strategy 3: installed puppeteer (fallback)
    if (!browser) {
      try {
        const puppeteerPkg = await import('puppeteer');
        const puppeteer = puppeteerPkg.default || puppeteerPkg;
        browser = await tryLaunch(() => puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] }));
      } catch (e) {
        lastError = e;
      }
    }

    if (browser) {
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' } });
        try { await page.close(); } catch (e) {}
        try { await browser.close(); } catch (e) {}
      } catch (err) {
        lastError = err;
        try { if (browser && browser.close) await browser.close(); } catch (e) {}
      }
    }

    const filenameBase = [context?.state, context?.district, context?.village].filter(Boolean).join('_') || 'dss_report';
    const filename = `${filenameBase.replace(/\s+/g, '_').toLowerCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(pdfBuffer));
  } catch (e) {
    console.error('PDF generation failed:', e);
    return res.status(500).json({ error: e?.message || 'Failed to generate PDF' });
  } finally {
    const ms = Date.now() - started;
    if (ms > 10000) console.warn(`[report/pdf] slow generation: ${ms}ms`);
  }
});

// Formatter endpoint
router.post('/format', async (req, res) => {
  try {
    const { data, context } = req.body || {};
    if (!data) return res.status(400).json({ error: 'Missing data' });
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    const prompt = buildGeminiPrompt(data, context || {});
    const modelId = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    // Prefer official SDK; fallback to raw fetch if it fails for any reason.
    let html = '';
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelId });
      const resp = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }]}],
        generationConfig: { temperature: 0.2, topP: 0.9, topK: 40, maxOutputTokens: 6000 }
      });
      html = resp?.response?.text?.() || resp?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (sdkErr) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }]}],
            generationConfig: { temperature: 0.2, topP: 0.9, topK: 40, maxOutputTokens: 6000 }
          })
        });
        if (!resp.ok) {
          const t = await resp.text();
          return res.status(502).json({ error: `Gemini error: ${resp.status}`, details: t.slice(0, 2000) });
        }
        const out = await resp.json();
        html = out?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (httpErr) {
        // Surface combined error
        return res.status(500).json({ error: 'Failed to format via Gemini', details: `${sdkErr?.message || sdkErr} | ${httpErr?.message || httpErr}` });
      }
    }

    // Strip markdown code fences if present
    if (typeof html === 'string' && html.trim().startsWith('```')) {
      html = html.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
    }
    return res.json({ html: String(html || '').trim() });
  } catch (e) {
    console.error('--- FETCH FAILED - CATCH BLOCK EXECUTED ---');
    console.error('The fetch() request itself failed. This points to a network, DNS, or firewall issue.');
    console.error('Full Error Object:', e); // This will show us the exact network error
    console.error('--- END OF CATCH BLOCK ---');
    return res.status(500).json({ error: e?.message || 'Failed to format report' });
  }
});

function buildGeminiPrompt(json, ctx) {
  const payload = JSON.stringify(json);
  const { state = '', district = '', village = '' } = ctx || {};
  return `You are a policy planning assistant. Transform the following JSON payload into a structured DSS report in HTML using EXACT sections A–F. Do not add boilerplate outside the report. Use semantic HTML (h2/h3/p/ul/li/table) with minimal inline styles for readability.\n\nSections and rules:\nA. Header\n- Title: "DSS Recommendations – {village or district}, {state}"\n- Date: {meta.generated_at}\n- AOI: State / District / Block / Village from aoi.* (use provided selections if missing)\n- Centroid: {aoi.centroid_lat}, {aoi.centroid_lon}\n- Area: If aoi.area_sqkm > 1e7 treat as m² and convert to km² = value/1e6, else keep as km². Show with 2 decimals.\n\nB. Executive Summary (5–7 bullets)\n- Translate indicators into actions for JJM, MGNREGA, DA-JGUA. Use PM-KISAN only if IFR/cultivator data exists.\n\nC. Context Snapshot\n- LULC: forest % (and cropland/built if present)\n- Groundwater: pre-monsoon depth, seasonal delta (sign rule), category/safety\n- Aquifer: type (quick intervention hint)\n- MGNREGA: jobcard issuance %, worker activation %, women participation % (+ counts if present)\n- Notes: meta.notes[]\n\nD. Scheme Recommendations (cards)\n- JJM – FHTC & source sustainability\n- MGNREGA – NRM & livelihood\n- DA-JGUA – FRA strengthening, TMMC feasibility, SCD/Education outreach\n- Each card shows Why (indicator), What (actions), Where/How (how to site using layers), Caveats.\n- PM-KISAN card ONLY if IFR/cultivator counts exist.\n\nE. Implementation & Convergence\n- Which line department leads and how to converge budgets (MGNREGA earthwork + JJM sustainability + CAMPA plantation, etc.).\n\nF. Annexure\n- Indicators table (numbers with units), Data sources (meta.data_sources), Disclaimers (meta.notes)\n\nFormatting rules:\n- Percentages: 1–2 decimals with %.\n- Thousands: toLocaleString('en-IN').\n- Nulls: show “—”.\n- Seasonal delta: positive = shallower post (good); negative = decline (flag).\n\nSelections for fallback: state=\\"${state}\\", district=\\"${district}\\", village=\\"${village}\\".\n\nJSON payload:\n\n\\u0060\\u0060\\u0060json\n${payload}\n\\u0060\\u0060\\u0060\n\nReturn ONLY the HTML content.`;
}

export default router;
