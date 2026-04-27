import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
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

// --- SECURITY: STRICT CORS CONFIGURATION ---
// Only allow requests from your trusted frontend domains
const allowedOrigins = [
  'https://securewebops.gannon.link', // Your actual production domain
  'http://localhost:5173',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [])
].map(url => url.trim().replace(/\/$/, ''));

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like server-to-server) or from allowed frontend
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      console.warn(`[SECURITY] Blocked request from unauthorized CORS origin: ${origin}`);
      return callback(null, false); // Return false instead of Error to avoid 500 HTML crashes
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.set('trust proxy', 1);

// --- SECURITY: GLOBAL API RATE LIMITING ---
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests from this IP, please try again later." },
});
app.use('/api', globalApiLimiter);

// --- SECURITY: BRUTE-FORCE PROTECTION ---
// Specific stricter rate limiter for sensitive routes (password decryption)
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // block after 10 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password attempts from this IP, please try again after an hour." }
});

// Apply strict rate limiting to password-protected decryption endpoints before the main router
app.use('/api/pdf/download', authLimiter);
app.use('/api/pdf/decrypt-external', authLimiter);

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