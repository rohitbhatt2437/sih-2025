import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './config/db.js';
import ocrRouter from './routes/ocr.js';
import aggregatesRouter from './routes/aggregates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Routes
app.use('/api/ocr', ocrRouter);
app.use('/api/aggregates', aggregatesRouter);

// DB and start
const PORT = process.env.PORT || 4000;
await connectDB();

// Startup diagnostics
const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
if (!hasGeminiKey) {
  console.warn('[Startup] GEMINI_API_KEY is not set. /api/ocr will return errors until it is configured.');
}
console.log(`[Startup] Gemini model: ${model}`);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
