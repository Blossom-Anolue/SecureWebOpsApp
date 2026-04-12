import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import pdfRoutes from './routes/pdfRoutes.js';
import extensionRoutes from './routes/extensionRoutes.js';
import scanRoutes, { publicScanRouter } from './routes/scanRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;
const publicApiBaseUrl = process.env.PUBLIC_API_BASE_URL?.trim() || null;

// Environment Warnings
if (!process.env.KMS_MASTER_SECRET) {
  console.warn('[WARN] KMS_MASTER_SECRET is not set. PDF encryption/decryption won\'t work.');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');
const extensionZipPath = path.join(__dirname, 'securewebops-extension.zip');

app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

// Standard Routes
app.use('/api/pdf', pdfRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api', publicScanRouter);
app.use('/api/scans', scanRoutes);
app.use('/api/user', userRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', message: 'SecureWebOps backend is running' });
});

app.get('/downloads/securewebops-extension.zip', (_req, res) => {
  return res.download(extensionZipPath, 'securewebops-extension.zip');
});

app.use(express.static(distPath));

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SUCCESS] Server started on port ${PORT}`);
  console.log('Server is globally accessible on the network.');
  if (publicApiBaseUrl) console.log(`Public API base URL: ${publicApiBaseUrl}`);
  console.log(`[ENV] ZAP_API_BASE_URL = ${process.env.ZAP_API_BASE_URL || '(not set)'}`);
});