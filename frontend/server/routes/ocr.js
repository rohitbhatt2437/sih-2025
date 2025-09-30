import express from 'express';
import multer from 'multer';
import { extractTextFromImages } from '../services/vision.js';
import { Claim } from '../models/Claim.js';
import { parseClaimFromText } from '../services/parser.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'No images uploaded' });

    // Optional state override coming from the client (single-select of 4 states)
    const rawOverride = (req.body?.overrideState || '').trim();
    const allowedStates = new Set(['Odisha', 'Telangana', 'Tripura', 'Madhya Pradesh']);
    const overrideState = allowedStates.has(rawOverride) ? rawOverride : null;

    const extracted = await extractTextFromImages(files);

    const results = [];
    for (let i = 0; i < extracted.length; i++) {
      const item = extracted[i];
      const source = files[i]?.originalname || null;
      if (!item.ok) {
        results.push({ index: i, ok: false, error: item.error, source_filename: source });
        continue;
      }
      // Parse OCR text into structured fields
      const parsed = parseClaimFromText(item.text || '');

      // Build a Claim doc populated with parsed fields (best effort)
      let savedId = null;
      try {
        if (process.env.MONGODB_URI) {
          const location = { ...(parsed.location || {}) };
          if (overrideState) location.state = overrideState;
          const doc = await Claim.create({
            // Defaults: status UNAPPROVED, submissionDate now
            formType: parsed.formType || null,
            status: 'UNAPPROVED',
            ocrMetadata: {
              sourceFile: source,
              confidenceScore: null,
              processedAt: new Date(),
            },
            rawText: item.text || '',
            // Parsed fields
            location,
            claimantInfo: parsed.claimantInfo,
            individualClaimDetails: parsed.individualClaimDetails,
            communityInfo: parsed.communityInfo,
            communityClaimDetails: parsed.communityClaimDetails,
            otherTraditionalRight: parsed.otherTraditionalRight,
          });
          savedId = doc._id.toString();
        }
      } catch (e) {
        // Ignore DB errors in response but log for diagnostics
        console.error('DB save error (Claim):', e?.message || e);
      }
      results.push({ index: i, ok: true, text: item.text || '', parsed, source_filename: source, id: savedId, created_at: new Date().toISOString() });
    }

    res.json({ count: results.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'OCR processing failed', details: err.message });
  }
});

export default router;
