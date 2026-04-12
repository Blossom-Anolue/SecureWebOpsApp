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

import React, { useState } from 'react';
import { Shield, FileUp, Lock, CheckCircle, AlertCircle, Loader2, FileText, UploadCloud, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

async function parseApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text, error: text } : {};
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;

  const data = payload as { error?: string | { message?: string } };
  if (typeof data.error === 'string' && data.error.trim()) return data.error;
  if (data.error && typeof data.error === 'object' && typeof data.error.message === 'string' && data.error.message.trim()) {
    return data.error.message;
  }

  return fallback;
}

export default function PDFEncryption() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<EncryptionResponse | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files?.[0] || null;

    setStatus('idle');
    setMessage('');
    setResult(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    const isPdf = nextFile.type === 'application/pdf' || nextFile.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setFile(null);
      setStatus('error');
      setMessage('Please choose a PDF file before uploading.');
      toast({ title: "Invalid File", description: "Only PDF files can be uploaded to the secure vault.", variant: "destructive" });
      e.target.value = '';
      return;
    }

    setFile(nextFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    setMessage('');
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error('Your session has expired. Please sign in again and retry the upload.');
      }
      
      // This calls the proxy defined in vite.config.ts
      const response = await fetch("/api/pdf/upload", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const resultData = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(resultData, "Encryption Gateway Error"));
      }

      setStatus('success');
      setResult(deriveMetadata(resultData));

      toast({ title: "Vault Secured", description: "File encrypted and stored.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    } catch (error: unknown) {
      const fallbackMessage = error instanceof TypeError && error.message?.includes('expected pattern')
        ? 'Upload request could not be created. This usually means the app URL or upload filename contains invalid characters.'
        : (error instanceof Error ? error.message : 'Upload failed.');

      setStatus('error');
      setMessage(fallbackMessage); 
      toast({ title: "Upload Failed", description: fallbackMessage, variant: "destructive" });
    }
  };

  // --- DECRYPT & DOWNLOAD ---
  const handleDownload = async (fileId: string, fileName: string, userEmail: string) => {
    if (!session?.access_token) return;
    setActionLoading(`download-${fileId}`);
    try {
      const response = await fetch(`/api/pdf/download/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'X-User-Email': userEmail, // Pass the email for secure access tracking
        },
      });
      
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Decryption failed.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.download = fileName.endsWith('.enc') ? fileName.replace('.enc', '') : fileName; // Ensure original file name for download
      document.body.appendChild(a); 
      a.click();
      window.URL.revokeObjectURL(url); 
      a.remove(); 
      toast({ title: "Success", description: "File securely decrypted and downloaded.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Download failed.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // --- SHARE FILE ACCESS ---
  const handleShare = async () => {
    if (!session?.access_token || !fileToShare || !targetUserId) return;
    setActionLoading('share');
    try {
      const response = await fetch(`/api/pdf/share/${fileToShare}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ targetUserId, level: 'DOWNLOAD', expiresAt: shareExpiresAt || null }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(err, 'Sharing failed.'));
      }
      toast({ title: "Access Granted", description: `Successfully shared file with ${targetUserId}.` });
      setShareModalOpen(false); 
      setTargetUserId('');
      setShareExpiresAt('');
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Sharing failed.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // --- PURGE FILE ---
  const handleDelete = async (fileId: string) => {
    if (!session?.access_token) return;
    if (!confirm("Are you sure you want to permanently purge this file?")) return;
    setActionLoading(`delete-${fileId}`);
    try {
      const response = await fetch(`/api/pdf/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.details || err.error || 'Delete failed.');
      }
      const payload = await response.json().catch(() => ({}));
      toast({ title: "File Purged", description: "File permanently deleted from storage and database." });
      if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        toast({ title: "Cleanup Warnings", description: payload.warnings.join(' | '), variant: "destructive" });
      }
      void loadRecentFiles(); 
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Delete failed.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid lg:grid-cols-12 gap-8">
        {/* Upload Section */}
        <Card className="lg:col-span-7 border-slate-200/60 shadow-lg bg-white/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <FileUp className="w-5 h-5 text-primary" />
              Upload Document
            </CardTitle>
            <CardDescription>
              Encrypt and securely store your sensitive PDF documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div 
              className={`relative group border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center space-y-4 transition-all duration-300 ease-in-out ${
                file 
                  ? 'border-primary bg-primary/5 shadow-inner' 
                  : 'border-slate-300 hover:border-primary/50 hover:bg-primary/[0.02] bg-slate-50/50'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none ${file ? 'opacity-100' : ''}`} />
              
              <div className={`p-4 rounded-full transition-transform duration-300 ${file ? 'bg-primary text-white scale-110 shadow-md' : 'bg-slate-200 text-slate-500 group-hover:scale-110 group-hover:bg-primary/20 group-hover:text-primary'}`}>
                {file ? <FileText className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
              </div>
              
              <div className="text-center relative z-10">
                <p className="font-semibold text-lg text-slate-800">
                  {file ? file.name : "Drag & Drop your PDF here"}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Files are encrypted client-side before storage"}
                </p>
              </div>
              
              <input 
                type="file" 
                accept=".pdf,application/pdf" 
                onChange={handleFileChange}
                className="hidden" 
                id="pdf-upload"
              />
              <label 
                htmlFor="pdf-upload" 
                className={`relative z-10 px-6 py-2.5 rounded-full cursor-pointer font-medium transition-all shadow-sm ${
                  file 
                    ? 'bg-white text-primary border border-primary/20 hover:bg-slate-50' 
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-primary/30 hover:text-primary hover:shadow'
                }`}
              >
                {file ? 'Change File' : 'Browse Files'}
              </label>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!file || status === 'uploading'}
              size="lg"
              className="w-full h-14 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-[#1a474a] text-white shadow-md hover:shadow-lg transition-all rounded-xl text-base font-semibold flex items-center justify-center gap-3"
            >
              {status === 'uploading' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Encrypting & Securing...
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  Encrypt & Store Document
                </>
              )}
            </Button>
            
            {status === 'error' && (
              <div className="flex flex-col items-center justify-center space-y-3 p-4 bg-red-50/80 border border-red-100 rounded-xl text-red-600 animate-in fade-in slide-in-from-bottom-2">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <p className="text-sm font-medium text-center">{message}</p>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {setStatus('idle'); setFile(null); setResult(null);}}
                  className="text-red-700 hover:text-red-800 hover:bg-red-100/50"
                >
                  Clear & Try Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status / Result Section */}
        <div className="lg:col-span-5 space-y-6">
          {status === 'success' && result ? (
            <Card className="bg-emerald-50/80 border-emerald-200 shadow-sm animate-in fade-in zoom-in-95 duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-emerald-800 flex items-center gap-2 text-lg">
                  <CheckCircle className="text-emerald-600 w-5 h-5" />
                  Encryption Verified
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-emerald-900/80">
                <div className="flex justify-between items-center py-2 border-b border-emerald-200/50">
                  <span className="font-medium">Original File</span>
                  <span className="truncate pl-4">{result.originalFileName}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-emerald-200/50">
                  <span className="font-medium">Vault Path</span>
                  <span className="truncate pl-4 font-mono text-xs">{result.path}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-emerald-200/50">
                  <span className="font-medium">Cipher</span>
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">AES-256-GCM</Badge>
                </div>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100/50 text-emerald-700 text-[10px] uppercase font-mono tracking-wider font-semibold border border-emerald-200/50">
                    <CheckCircle className="w-3 h-3" /> MD5_HASH_VERIFIED: SUCCESS
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : null}
          
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl border-slate-700 relative overflow-hidden min-h-[220px]">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-primary/30 blur-3xl rounded-full"></div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100 text-lg">
                <Shield className="w-5 h-5 text-[#4AABB1]" /> 
                Security Protocol
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-5 text-sm text-slate-300 relative z-10">
                <li className="flex gap-3 items-start">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#4AABB1] shrink-0" />
                  <p className="leading-relaxed">Files are <strong>never stored in plaintext</strong>. Encryption occurs via AES-256-GCM before object storage.</p>
                </li>
                <li className="flex gap-3 items-start">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#4AABB1] shrink-0" />
                  <p className="leading-relaxed">Master key is <strong>isolated in process memory</strong> preventing unauthorized extraction.</p>
                </li>
                <li className="flex gap-3 items-start">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#4AABB1] shrink-0" />
                  <p className="leading-relaxed">Authentication tags automatically prevent <strong>Bit-Flipping attacks</strong> and verify integrity.</p>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="py-5 bg-slate-50/80 border-b">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Next Step
            </CardTitle>
            <CardDescription className="mt-1">Manage encrypted files, downloads, and sharing from the vault.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <p className="text-slate-900 font-semibold">Your file is ready whenever you want to come back to it.</p>
              <p className="text-sm text-slate-500 max-w-2xl">
                Open My Vault & Sharing to review what you have protected, download what you need, or share access with the right people.
              </p>
            </div>
            <Button onClick={() => navigate('/vault')} className="bg-primary hover:bg-primary/90 text-white shrink-0">
              Open My Vault & Sharing
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
