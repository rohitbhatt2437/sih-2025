import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './config/db.js';
import ocrRouter from './routes/ocr.js';
import aggregatesRouter from './routes/aggregates.js';
import claimsRouter from './routes/claims.js';
import reportRouter from './routes/report.js';

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
app.use('/api/claims', claimsRouter);
app.use('/api/report', reportRouter);

// DB and start
const PORT = process.env.PORT || 4000;
await connectDB();

// Startup diagnostics
if (!process.env.VISION_API_KEY) {
  console.warn('[Startup] VISION_API_KEY is not set. /api/ocr will return errors until it is configured.');
}

// On Vercel serverless, we export the app and do NOT listen on a port
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

export default app;
