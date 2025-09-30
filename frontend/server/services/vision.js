const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Calls Google Cloud Vision OCR (DOCUMENT_TEXT_DETECTION) for each image buffer.
 * @param {Array<{ buffer: Buffer, mimetype?: string }>} images 
 * @returns {Promise<Array<{ ok: boolean, text?: string, error?: string }>>}
 */
export async function extractTextFromImages(images) {
  const apiKey = process.env.VISION_API_KEY;
  if (!apiKey) throw new Error('VISION_API_KEY not set');

  const requests = images.map((img) => ({
    image: { content: img.buffer.toString('base64') },
    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
  }));

  const res = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vision API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const outputs = [];
  const responses = Array.isArray(data.responses) ? data.responses : [];
  for (let i = 0; i < images.length; i++) {
    const r = responses[i];
    if (!r) { outputs.push({ ok: false, error: 'No response for image' }); continue; }
    if (r.error) { outputs.push({ ok: false, error: `${r.error.message || 'Unknown Vision error'}` }); continue; }
    const text = r.fullTextAnnotation?.text || '';
    outputs.push({ ok: true, text });
  }
  return outputs;
}
