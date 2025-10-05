import express from 'express';
import mongoose from 'mongoose';
import fetch from 'node-fetch';
import { Claim } from '../models/Claim.js';

// ---- External services and helpers for centroid lookup ----
const STATES_FS = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/state_boundary/FeatureServer/0';
const DISTRICTS_FS = 'https://services5.arcgis.com/73n8CSGpSSyHr1T9/arcgis/rest/services/district_boundary/FeatureServer/0';
const VILLAGE_SERVICE = 'https://livingatlas.esri.in/server/rest/services/IAB2024/IAB_Village_2024/MapServer/0';

const STATE_LABEL_TO_CODE = {
  'Madhya Pradesh': 'MP',
  'Tripura': 'TR',
  'Odisha': 'OD',
  'Telangana': 'TS', // layer may use TS/TG
};

// Last-resort state centroids (lon, lat) if ArcGIS lookup fails
const STATE_FALLBACK_CENTROIDS = {
  'Telangana': { lon: 79.0193, lat: 18.1124 },
  'Odisha': { lon: 85.0985, lat: 20.9517 },
  'Madhya Pradesh': { lon: 78.6569, lat: 22.9734 },
  'Tripura': { lon: 91.9790, lat: 23.9408 },
};

// Simple in-memory cache to avoid repeated lookups
const centroidCache = new Map(); // key -> { lon, lat }

function cacheKey(parts = []) {
  return parts.map(s => String(s || '').trim().toLowerCase()).join('|');
}

function centroidOfGeoJSON(geom) {
  if (!geom) return null;
  const pushPt = (arr, pt) => { if (Array.isArray(pt) && pt.length >= 2) arr.push([Number(pt[0]), Number(pt[1])]); };
  const pts = [];
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates || [];
    if (rings[0]) for (const p of rings[0]) pushPt(pts, p);
  } else if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates || [];
    for (const poly of polys) if (poly[0]) for (const p of poly[0]) pushPt(pts, p);
  }
  if (pts.length === 0) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  return { lon: sx / pts.length, lat: sy / pts.length };
}

function centroidOfEsriGeometry(geom) {
  if (!geom) return null;
  const pts = [];
  const push = (x, y) => { x = Number(x); y = Number(y); if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]); };
  if (geom.rings) {
    const rings = geom.rings;
    if (Array.isArray(rings) && rings.length) {
      for (const ring of rings) {
        if (Array.isArray(ring)) {
          for (const p of ring) if (Array.isArray(p) && p.length >= 2) push(p[0], p[1]);
        }
      }
    }
  } else if (geom.paths) {
    for (const path of geom.paths) for (const p of path) if (Array.isArray(p) && p.length >= 2) push(p[0], p[1]);
  }
  if (!pts.length) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  return { lon: sx / pts.length, lat: sy / pts.length };
}

async function queryEsri(url, params) {
  const qp = new URLSearchParams(params);
  const resp = await fetch(`${url}/query?${qp.toString()}`);
  if (!resp.ok) return null;
  try { return await resp.json(); } catch { return null; }
}

async function geocodeVillageCentroid(stateName, districtName, villageName) {
  if (!stateName || !districtName || !villageName) return null;
  const key = cacheKey(['v', stateName, districtName, villageName]);
  if (centroidCache.has(key)) return centroidCache.get(key);
  const escS = String(stateName).replace(/'/g, "''");
  const escD = String(districtName).replace(/'/g, "''");
  const escV = String(villageName).replace(/'/g, "''");
  const tries = [
    // Common Living Atlas fields
    `UPPER(State)=UPPER('${escS}') AND UPPER(District)=UPPER('${escD}') AND UPPER(Name)=UPPER('${escV}')`,
    // Alternative naming
    `UPPER(ST_NM)=UPPER('${escS}') AND UPPER(DIST_NM)=UPPER('${escD}') AND UPPER(VILL_NM)=UPPER('${escV}')`,
    // Fuzzy LIKE
    `UPPER(State) LIKE UPPER('%${escS}%') AND UPPER(District) LIKE UPPER('%${escD}%') AND UPPER(Name) LIKE UPPER('%${escV}%')`,
  ];
  let geom = null;
  for (const where of tries) {
    const data = await queryEsri(VILLAGE_SERVICE, { where, outFields: 'OBJECTID', returnGeometry: 'true', f: 'json', resultRecordCount: '1' });
    if (data?.features?.length) { geom = data.features[0].geometry; break; }
  }
  const c = centroidOfEsriGeometry(geom);
  if (c) centroidCache.set(key, c);
  return c;
}

async function geocodeDistrictCentroid(stateName, districtName) {
  if (!stateName || !districtName) return null;
  const key = cacheKey(['d', stateName, districtName]);
  if (centroidCache.has(key)) return centroidCache.get(key);
  // Map state label to codes used by district layer
  const code = STATE_LABEL_TO_CODE[stateName] || stateName;
  const codes = code === 'TS' ? ['TS', 'TG', 'Telangana'] : [code, stateName];
  const escD = String(districtName).replace(/'/g, "''");
  const tries = [
    `UPPER(district)=UPPER('${escD}') AND state IN (${codes.map(c => `'${String(c).replace(/'/g, "''")}'`).join(',')})`,
    `UPPER(District)=UPPER('${escD}') AND UPPER(State) IN (${codes.map(c => `UPPER('${String(c).replace(/'/g, "''")}')`).join(',')})`,
    `UPPER(dtname)=UPPER('${escD}')`,
  ];
  let geom = null;
  for (const where of tries) {
    const data = await queryEsri(DISTRICTS_FS, { where, outFields: 'OBJECTID', returnGeometry: 'true', f: 'json', resultRecordCount: '1' });
    if (data?.features?.length) { geom = data.features[0].geometry; break; }
  }
  const c = centroidOfEsriGeometry(geom);
  if (c) centroidCache.set(key, c);
  return c;
}

async function geocodeStateCentroid(stateName) {
  if (!stateName) return null;
  const key = cacheKey(['s', stateName]);
  if (centroidCache.has(key)) return centroidCache.get(key);
  const code = STATE_LABEL_TO_CODE[stateName] || stateName;
  const escCode = String(code).replace(/'/g, "''");
  const escName = String(stateName).replace(/'/g, "''");
  const tries = [
    `(State_Name='${escCode}' OR State_FSI='${escName}')`,
    `UPPER(State_Name)=UPPER('${escName}')`,
    `UPPER(State_FSI)=UPPER('${escName}')`,
    `UPPER(STATE_NAME)=UPPER('${escName}')`,
    `UPPER(STATE)=UPPER('${escName}')`,
    `UPPER(stname)=UPPER('${escName}')`,
    `UPPER(st_nm)=UPPER('${escName}')`,
  ];
  let geom = null;
  for (const where of tries) {
    const data = await queryEsri(STATES_FS, { where, outFields: 'OBJECTID', returnGeometry: 'true', f: 'json', resultRecordCount: '1' });
    if (data?.features?.length) { geom = data.features[0].geometry; break; }
  }
  let c = centroidOfEsriGeometry(geom);
  if (!c) {
    // Fallback to hardcoded centroid if available
    const fb = STATE_FALLBACK_CENTROIDS[stateName];
    if (fb) c = { lon: fb.lon, lat: fb.lat };
  }
  if (c) centroidCache.set(key, c);
  return c;
}

const router = express.Router();

function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/claims/states?status=UNAPPROVED
router.get('/states', async (req, res) => {
  try {
    const status = req.query.status || 'UNAPPROVED';
    const data = await Claim.aggregate([
      { $match: { status } },
      { $group: { _id: '$location.state', count: { $sum: 1 } } },
      { $project: { state: '$_id', count: 1, _id: 0 } },
      { $sort: { state: 1 } },
    ]);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/claims/map-points?state=&district=&village=&status=&formTypes=a,b,c
// Returns minimal point features for mapping with valid geo coordinates
router.get('/map-points', async (req, res) => {
  try {
    const { state, district, village, formTypes } = req.query;
    // Default to APPROVED for mapping use-case
    const status = req.query.status || 'APPROVED';
    const q = { status };
    const andClauses = [];
    if (state) {
      const r = new RegExp(escapeRegex(String(state).trim()), 'i');
      andClauses.push({ $or: [
        { 'location.state': { $regex: r } },
        { 'claimantInfo.address': { $regex: r } },
      ]});
    }
    if (district) {
      const r = new RegExp(escapeRegex(String(district).trim()), 'i');
      andClauses.push({ $or: [
        { 'location.district': { $regex: r } },
        { 'claimantInfo.address': { $regex: r } },
      ]});
    }
    if (village) {
      const r = new RegExp(escapeRegex(String(village).trim()), 'i');
      andClauses.push({ $or: [
        { 'location.villageGramSabha': { $regex: r } },
        { 'claimantInfo.address': { $regex: r } },
      ]});
    }
    if (formTypes) {
      const list = String(formTypes).split(',').map(s => s.trim()).filter(Boolean);
      if (list.length) andClauses.push({ formType: { $in: list } });
    }
    if (andClauses.length === 1) Object.assign(q, andClauses[0]);
    else if (andClauses.length > 1) q.$and = andClauses;

    // Do NOT require geoLocation; we'll compute centroids if missing

    const items = await Claim.find(q)
      .select({
        formType: 1,
        status: 1,
        'location.geoLocation': 1,
        'location.state': 1,
        'location.district': 1,
        'location.villageGramSabha': 1,
        'claimantInfo.address': 1,
        submissionDate: 1,
      })
      .limit(2000)
      .lean();

    const features = [];
    for (const d of items) {
      let lon = undefined, lat = undefined;
      const coords = d?.location?.geoLocation?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        lon = Number(coords[0]); lat = Number(coords[1]);
      }
      if (!(Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) {
        // Try to resolve centroid by village -> district -> state
        const s = d?.location?.state || '';
        const dist = d?.location?.district || '';
        const vill = d?.location?.villageGramSabha || '';
        let c = null;
        if (s && dist && vill) c = await geocodeVillageCentroid(s, dist, vill);
        if (!c && s && dist) c = await geocodeDistrictCentroid(s, dist);
        if (!c && s) c = await geocodeStateCentroid(s);
        if (c) { lon = c.lon; lat = c.lat; }
      }
      if (!(Number.isFinite(lon) && Number.isFinite(lat))) {
        // Absolute last resort: India approx centroid to at least show a marker
        lon = 78.9629; lat = 20.5937;
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: String(d._id),
          formType: d.formType || null,
          status: d.status || null,
          state: d.location?.state || '',
          district: d.location?.district || '',
          village: d.location?.villageGramSabha || '',
          address: d.claimantInfo?.address || '',
          date: d.submissionDate || null,
        }
      });
    }

    res.json({ type: 'FeatureCollection', features });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/claims/districts?state=...&status=UNAPPROVED
router.get('/districts', async (req, res) => {
  try {
    const { state } = req.query;
    const status = req.query.status || 'UNAPPROVED';
    if (!state) return res.status(400).json({ error: 'state is required' });
    const normState = String(state || '').trim();
    const stateRegex = new RegExp(escapeRegex(normState), 'i');
    const data = await Claim.aggregate([
      { $match: { status, $or: [
        { 'location.state': { $regex: stateRegex } },
        { 'claimantInfo.address': { $regex: stateRegex } },
      ] } },
      { $group: { _id: '$location.district', count: { $sum: 1 } } },
      { $project: { district: '$_id', count: 1, _id: 0 } },
      { $sort: { district: 1 } },
    ]);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/claims/villages?state=...&district=...&status=UNAPPROVED
router.get('/villages', async (req, res) => {
  try {
    const { state, district } = req.query;
    const status = req.query.status || 'UNAPPROVED';
    if (!state || !district) return res.status(400).json({ error: 'state and district are required' });
    const normState = String(state || '').trim();
    const normDistrict = String(district || '').trim();
    const stateRegex = new RegExp(escapeRegex(normState), 'i');
    const districtRegex = new RegExp(escapeRegex(normDistrict), 'i');
    const data = await Claim.aggregate([
      { $match: { status, $and: [
        { $or: [ { 'location.state': { $regex: stateRegex } }, { 'claimantInfo.address': { $regex: stateRegex } } ] },
        { $or: [ { 'location.district': { $regex: districtRegex } }, { 'claimantInfo.address': { $regex: districtRegex } } ] },
      ] } },
      { $group: { _id: '$location.villageGramSabha', count: { $sum: 1 } } },
      { $project: { village: '$_id', count: 1, _id: 0 } },
      { $sort: { village: 1 } },
    ]);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/claims/list?state=...&district=...&village=...&status=UNAPPROVED
router.get('/list', async (req, res) => {
  try {
    const { state, district, village } = req.query;
    const status = req.query.status || 'UNAPPROVED';
    const q = { status };
    const andClauses = [];
    if (state) {
      const stateRegex = new RegExp(escapeRegex(String(state).trim()), 'i');
      andClauses.push({ $or: [
        { 'location.state': { $regex: stateRegex } },
        { 'claimantInfo.address': { $regex: stateRegex } },
      ]});
    }
    if (district) {
      const districtRegex = new RegExp(escapeRegex(String(district).trim()), 'i');
      andClauses.push({ $or: [
        { 'location.district': { $regex: districtRegex } },
        { 'claimantInfo.address': { $regex: districtRegex } },
      ]});
    }
    if (village) {
      const villageRegex = new RegExp(escapeRegex(String(village).trim()), 'i');
      andClauses.push({ $or: [
        { 'location.villageGramSabha': { $regex: villageRegex } },
        { 'claimantInfo.address': { $regex: villageRegex } },
      ]});
    }
    if (andClauses.length === 1) {
      Object.assign(q, andClauses[0]);
    } else if (andClauses.length > 1) {
      q.$and = andClauses;
    }
    const items = await Claim.find(q)
      .sort({ submissionDate: -1 })
      .limit(500)
      .lean();
    const data = items.map(d => ({
      id: d._id.toString(),
      formType: d.formType,
      status: d.status,
      name: d.claimantInfo?.name || '',
      appliedDate: d.submissionDate || d.createdAt,
      approvalDate: d.approvalDate || null,
      address: {
        state: d.location?.state || '',
        district: d.location?.district || '',
        tehsilTaluka: d.location?.tehsilTaluka || '',
        gramPanchayat: d.location?.gramPanchayat || '',
        village: d.location?.villageGramSabha || '',
        full: d.claimantInfo?.address || '',
      },
    }));
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/claims/:id  body: { status?, rejectionReason?, updates? }
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

    const { status, rejectionReason, updates } = req.body || {};
    const $set = {};
    if (status) {
      $set.status = status;
      if (status === 'APPROVED') $set.approvalDate = new Date();
      if (status === 'REJECTED') $set.rejectionReason = rejectionReason || '';
    }
    if (updates && typeof updates === 'object') {
      // shallow merge supported fields
      for (const [k, v] of Object.entries(updates)) {
        $set[k] = v;
      }
    }
    const doc = await Claim.findByIdAndUpdate(id, { $set }, { new: true });
    res.json({ ok: true, data: { id: doc?._id?.toString() } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
