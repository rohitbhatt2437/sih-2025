import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';

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
      } catch {}
      if (!html || !html.trim()) html = formatHtmlFallbackServer(data, context || {});
    }
    if (html.trim().startsWith('```')) html = html.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');

    // Launch Chromium (serverless-friendly if applicable)
    const isServerless = !!(process.env.VERCEL || process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV);
    let browser;
    if (isServerless) {
      const puppeteerCore = (await import('puppeteer-core')).default;
      const execPath = await chromium.executablePath();
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: execPath,
        headless: chromium.headless,
      });
    } else {
      browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' } });
    await page.close();
    await browser.close();

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
