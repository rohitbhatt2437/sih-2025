import express from 'express';
import multer from 'multer';
import { extractFromImages } from '../services/gemini.js';
import { geocodeLocation } from '../services/geocode.js';
import { Record } from '../models/Record.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'No images uploaded' });

    const extracted = await extractFromImages(files);

    const results = [];
    for (let i = 0; i < extracted.length; i++) {
      const item = extracted[i];
      if (!item.ok) {
        results.push({ index: i, ok: false, error: item.error });
        continue;
      }
      const data = item.data;
      // Attach source filename
      data.meta = {
        ...(data.meta || {}),
        source_filename: files[i]?.originalname || null,
        created_at: new Date().toISOString(),
      };

      // Geocode
      const geo = await geocodeLocation(data.location || {});
      data.location = { ...(data.location || {}), geo };

      // Save if DB configured
      let savedId = null;
      try {
        if (process.env.MONGODB_URI) {
          const rec = await Record.create(data);
          savedId = rec._id.toString();
        }
      } catch (e) {
        // ignore DB errors in prototype
      }

      results.push({ index: i, ok: true, data, id: savedId });
    }

    res.json({ count: results.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'OCR processing failed', details: err.message });
  }
});

export default router;
