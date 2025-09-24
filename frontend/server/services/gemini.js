import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

function buildPrompt() {
  return `You are an information extraction engine for scanned documents about participation in Indian government schemes.\n\nReturn ONLY valid JSON matching this schema (do not include markdown or explanations):\n{\n  "document_id": string | null,\n  "participant": {\n    "name": string | null,\n    "gender": string | null,\n    "age": number | null,\n    "phone": string | null,\n    "id_type": string | null,\n    "id_number": string | null\n  },\n  "scheme": { "name": string | null, "code": string | null },\n  "location": {\n    "address_text": string | null,\n    "village": string | null,\n    "ward": string | null,\n    "tehsil": string | null,\n    "district": string | null,\n    "state": string | null,\n    "pincode": string | null,\n    "country": "India",\n    "geo": { "lat": null, "lon": null, "geocode_confidence": null }\n  },\n  "participation": {\n    "enrollment_date": string | null,\n    "status": "Enrolled" | "Applied" | "Approved" | "Benefitted" | "Unknown"\n  },\n  "meta": {\n    "language": "Hindi" | "English" | "Mixed" | null,\n    "ocr_confidence": number | null,\n    "source_filename": string | null,\n    "created_at": string\n  }\n}\n\nGuidelines:\n- Output strictly JSON, no prose.\n- If a field is missing, use null.\n- Dates must be ISO YYYY-MM-DD if possible.\n- Normalize gender to Male/Female if obvious.\n- Consider Hindi and English.\n`;
}

export async function extractFromImages(images) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });

  const prompt = buildPrompt();

  const results = [];
  for (const img of images) {
    try {
      const parts = [
        { text: prompt },
        {
          inlineData: {
            data: img.buffer.toString('base64'),
            mimeType: img.mimetype || 'image/png',
          },
        },
      ];
      const resp = await model.generateContent({ contents: [{ role: 'user', parts }] });
      const text = resp.response.text();
      // Strip code fences if any
      const jsonText = text.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(jsonText);
      results.push({ ok: true, data: parsed });
    } catch (err) {
      results.push({ ok: false, error: err.message });
    }
  }
  return results;
}
