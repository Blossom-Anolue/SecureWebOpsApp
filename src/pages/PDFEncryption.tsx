/**
 * @fileoverview PDF Encryption Page
 * * This page allows users to upload sensitive PDF documents for 
 * AES-256-GCM encryption before storage.
 * * Flow:
 * 1. User selects a PDF file locally.
 * 2. File is sent to the Proxmox Backend (172.20.0.220).
 * 3. Backend encrypts the file and logs the action in Supabase.
 * 4. User receives a success confirmation and an encrypted download link.
 * * @module pages/PDFEncryption
 */

import React, { useEffect, useState } from 'react';
import { Shield, FileUp, Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

type EncryptionResponse = {
  message?: string;
  error?: string;
  originalFileName?: string;
  encryptedFileName?: string;
  encryptedAt?: string;
  keyLabel?: string;
  bucket?: string;
  path?: string;
};

type RecentEncryptedFile = {
  name: string;
  path: string;
  createdAt?: string | null;
  size?: number | null;
  mimeType?: string | null;
};

type RecentFilesResponse = {
  bucket?: string;
  files?: RecentEncryptedFile[];
};

function deriveMetadata(payload: EncryptionResponse): EncryptionResponse {
  const encryptedFileName = payload.encryptedFileName || payload.path?.split('/').pop();
  const match = encryptedFileName?.match(/^secure_(\d+)_(.+)\.enc$/);
  const derivedOriginal = match?.[2];
  const derivedEncryptedAt = match?.[1] ? new Date(Number(match[1])).toISOString() : undefined;

  return {
    ...payload,
    encryptedFileName,
    originalFileName: payload.originalFileName || derivedOriginal,
    encryptedAt: payload.encryptedAt || derivedEncryptedAt,
  };
}

export default function PDFEncryption() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<EncryptionResponse | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentEncryptedFile[]>([]);
  const [recentBucket, setRecentBucket] = useState<string>('pdfs');
  const [recentLoading, setRecentLoading] = useState<boolean>(true);
  const [recentError, setRecentError] = useState<string>('');

  const BACKEND_URL = import.meta.env.VITE_PDF_UPLOAD_URL || "/api/pdf/upload";
  const RECENT_URL = import.meta.env.VITE_PDF_RECENT_URL || "/api/pdf/recent?limit=8";

  const loadRecentFiles = async () => {
    try {
      setRecentLoading(true);
      setRecentError('');
      const response = await fetch(RECENT_URL);
      const payload = (await response.json()) as RecentFilesResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load recent encrypted files.');
      }
      setRecentBucket(payload.bucket || 'pdfs');
      setRecentFiles(payload.files || []);
    } catch (error) {
      setRecentError(error instanceof Error ? error.message : 'Failed to load recent encrypted files.');
      setRecentFiles([]);
    } finally {
      setRecentLoading(false);
    }
  };

  useEffect(() => {
    void loadRecentFiles();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as EncryptionResponse;

      if (response.ok) {
        setStatus('success');
        setResult(deriveMetadata(payload));
        setMessage(payload.message || 'File encrypted and stored successfully on the secure server.');
        void loadRecentFiles();
      } else {
        throw new Error(payload.error || 'Encryption failed. Check backend logs.');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
      setResult(null);
      setMessage(error instanceof Error ? error.message : 'Upload failed. Check backend logs.');
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-display">Secure PDF Vault</h1>
        <p className="text-muted-foreground mt-1">AES-256 encryption for sensitive business documents</p>
      </div>

      <div className="max-w-2xl mx-auto bg-card rounded-xl border shadow-card p-8">
        {status === 'idle' || status === 'uploading' ? (
          <div className="space-y-6 text-center">
            <div className="border-2 border-dashed border-muted rounded-lg p-10 flex flex-col items-center justify-center space-y-4">
              <FileUp className="w-12 h-12 text-primary" />
              <div>
                <p className="font-medium">{file ? file.name : "Select a PDF document"}</p>
                <p className="text-xs text-muted-foreground">Max file size: 10MB</p>
              </div>
              <input 
                type="file" 
                accept="application/pdf" 
                onChange={handleFileChange}
                className="hidden" 
                id="pdf-upload"
              />
              <label 
                htmlFor="pdf-upload" 
                className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md cursor-pointer hover:bg-secondary/80 transition-colors"
              >
                Browse Files
              </label>
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || status === 'uploading'}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold disabled:opacity-50"
            >
              {status === 'uploading' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Encrypting locally...
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  Encrypt & Secure
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4 py-6">
            {status === 'success' ? (
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            ) : (
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
            )}
            <h3 className="text-xl font-bold">{status === 'success' ? 'Success!' : 'Error'}</h3>
            <p className="text-muted-foreground">{message}</p>
            {status === 'success' && result && (
              <div className="text-left text-sm bg-muted/60 border rounded-lg p-4 space-y-2">
                <p><strong>Original file:</strong> {result.originalFileName || '-'}</p>
                <p><strong>Encrypted file:</strong> {result.encryptedFileName || '-'}</p>
                <p><strong>Encrypted at:</strong> {result.encryptedAt ? new Date(result.encryptedAt).toLocaleString() : '-'}</p>
                <p><strong>Key label:</strong> {result.keyLabel || 'kms-master-v1'}</p>
                <p><strong>Supabase storage:</strong> {result.bucket || '-'} / {result.path || '-'}</p>
              </div>
            )}
            <button 
              onClick={() => {setStatus('idle'); setFile(null); setResult(null);}}
              className="text-primary font-medium hover:underline"
            >
              Secure another file
            </button>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto bg-card rounded-xl border shadow-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Encrypted Files</h2>
          <button
            onClick={() => void loadRecentFiles()}
            className="text-sm text-primary hover:underline"
            type="button"
          >
            Refresh
          </button>
        </div>

        {recentLoading ? (
          <p className="text-sm text-muted-foreground">Loading recent files...</p>
        ) : recentError ? (
          <p className="text-sm text-red-500">{recentError}</p>
        ) : recentFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No encrypted files found in bucket `{recentBucket}`.</p>
        ) : (
          <div className="space-y-3">
            {recentFiles.map((entry) => (
              <div key={entry.path} className="border rounded-md p-3 text-sm">
                <p><strong>File:</strong> {entry.name}</p>
                <p><strong>Date:</strong> {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-'}</p>
                <p><strong>Size:</strong> {typeof entry.size === 'number' ? `${Math.round(entry.size / 1024)} KB` : '-'}</p>
                <p><strong>Storage:</strong> {recentBucket} / {entry.path}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security Context Note for Senior Design */}
      <div className="bg-muted/50 rounded-lg p-4 flex gap-3 items-start border">
        <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong>Security Note:</strong> Files are processed using an AES-256-GCM authenticated encryption cipher. 
          The master key is protected within the Proxmox environment and never exposed to the client-side browser.
        </p>
      </div>
    </div>
  );
}
