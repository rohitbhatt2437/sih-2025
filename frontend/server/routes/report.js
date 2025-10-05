import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

// Proxy endpoint
router.get('/', async (req, res) => {
  try {
    const { state, district, village } = req.query || {};
    if (!state || String(state).trim() === '') {
      return res.status(400).json({ error: 'Missing required parameter: state' });
    }
    const base = 'https://fra-report-generator-375005976373.europe-west1.run.app/report';
    const qs = new URLSearchParams();
    qs.set('state', String(state));
    if (district) qs.set('district', String(district));
    if (village) qs.set('village', String(village));
    const url = `${base}?${qs.toString()}`;
    const upstream = await fetch(url);
    const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    if (contentType.includes('application/json')) {
      const data = await upstream.json();
      return res.json({ url, ...data });
    } else {
      const text = await upstream.text();
      return res.send(text);
    }
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'Failed to fetch report' });
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
