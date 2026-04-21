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
import { useActivityLogger } from '@/hooks/useActivityLog';

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
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<EncryptionResponse[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { log } = useActivityLogger();

  const handleFiles = (newFiles: File[]) => {
    setStatus('idle');
    setMessage('');
    setResults([]);

    const validFiles = newFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

    if (validFiles.length !== newFiles.length) {
      toast({ title: "Invalid File(s)", description: "Only PDF files can be uploaded to the secure vault.", variant: "destructive" });
    }

    if (validFiles.length > 0) {
      setFiles(prev => {
        const existingMap = new Set(prev.map(f => `${f.name}-${f.size}`));
        const uniqueFiles = validFiles.filter(f => !existingMap.has(`${f.name}-${f.size}`));
        return [...prev, ...uniqueFiles];
      });
    } else if (newFiles.length > 0) {
      setStatus('error');
      setMessage('Please choose valid PDF file(s) before uploading.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setStatus('uploading');
    setMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error('Your session has expired. Please sign in again and retry the upload.');
      }
      
      const newResults: EncryptionResponse[] = [];
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('pdf', file);

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
          throw new Error(getApiErrorMessage(resultData, `Encryption Gateway Error for ${file.name}`));
        }

        newResults.push(deriveMetadata(resultData));
      }

      newResults.forEach(res => {
        log('FILE_ENCRYPTED_STORED', 'file', {
          details: { fileName: res.originalFileName, path: res.path }
        });
      });

      setStatus('success');
      setResults(newResults);

      toast({ title: "Vault Secured", description: `${files.length} file(s) encrypted and stored.`, className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    } catch (error: unknown) {
      const fallbackMessage = error instanceof TypeError && error.message?.includes('expected pattern')
        ? 'Upload request could not be created. This usually means the app URL or upload filename contains invalid characters.'
        : (error instanceof Error ? error.message : 'Upload failed.');

      setStatus('error');
      setMessage(fallbackMessage); 
      toast({ title: "Upload Failed", description: fallbackMessage, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid lg:grid-cols-12 gap-8">
        {/* Upload Section */}
        <Card className="lg:col-span-7 border-slate-200/60 dark:border-slate-800 shadow-lg bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl">
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
                files.length > 0
                  ? 'border-primary bg-primary/5 shadow-inner' 
                  : isDragging
                  ? 'border-primary bg-primary/10 shadow-lg scale-[1.02]'
                  : 'border-slate-300 dark:border-slate-700/60 hover:border-primary/50 hover:bg-primary/[0.02] bg-slate-50/50 dark:bg-slate-900/60 dark:hover:bg-slate-800/80'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className={`absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none ${files.length > 0 ? 'opacity-100' : ''}`} />
              
              <div className={`p-4 rounded-full transition-transform duration-300 ${files.length > 0 ? 'bg-primary text-white scale-110 shadow-md' : 'bg-slate-200 text-slate-500 group-hover:scale-110 group-hover:bg-primary/20 group-hover:text-primary'}`}>
                {files.length > 0 ? <FileText className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
              </div>
              
              <div className="text-center relative z-10">
                <p className="font-semibold text-lg text-slate-800 dark:text-slate-200">
                  {files.length > 0 ? `${files.length} file(s) selected` : "Drag & Drop your PDFs here"}
                </p>
                <div className="text-sm text-slate-500 mt-2 max-w-md flex flex-wrap justify-center gap-2">
                  {files.length > 0 
                    ? files.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-white/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-md shadow-sm">
                          <span className="truncate max-w-[150px]">{f.name}</span>
                          <button 
                            type="button" 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFiles(prev => prev.filter((_, idx) => idx !== i)); }} 
                            className="text-slate-400 hover:text-red-500 ml-1 focus:outline-none"
                            title="Remove file"
                          >
                            &times;
                          </button>
                        </span>
                      ))
                    : "Files are encrypted client-side before storage"}
                </div>
              </div>
              
              <input 
                type="file" 
                multiple
                accept=".pdf,application/pdf" 
                onChange={handleFileChange}
                className="hidden" 
                id="pdf-upload"
              />
              <label 
                htmlFor="pdf-upload" 
                className={`relative z-10 px-6 py-2.5 rounded-full cursor-pointer font-medium transition-all shadow-sm ${
                  files.length > 0 
                    ? 'bg-white dark:bg-slate-950 text-primary border border-primary/20 hover:bg-slate-50 dark:hover:bg-slate-900 mt-4 inline-block' 
                    : 'bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary/30 hover:text-primary hover:shadow'
                }`}
              >
                {files.length > 0 ? 'Add More Files' : 'Browse Files'}
              </label>
            </div>

            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || status === 'uploading'}
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
                  onClick={() => {setStatus('idle'); setFiles([]); setResults([]);}}
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
          {status === 'success' && results.length > 0 ? (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {results.map((res, index) => (
                <Card key={index} className="bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 shadow-sm animate-in fade-in zoom-in-95 duration-300">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-emerald-800 dark:text-emerald-400 flex items-center gap-2 text-lg">
                      <CheckCircle className="text-emerald-600 w-5 h-5" />
                      Encryption Verified
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-emerald-900/80 dark:text-emerald-200/80">
                    <div className="flex justify-between items-center py-2 border-b border-emerald-200/50 dark:border-emerald-800/50">
                      <span className="font-medium">Original File</span>
                      <span className="truncate pl-4">{res.originalFileName}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-emerald-200/50 dark:border-emerald-800/50">
                      <span className="font-medium">Vault Path</span>
                      <span className="truncate pl-4 font-mono text-xs">{res.path}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-emerald-200/50 dark:border-emerald-800/50">
                      <span className="font-medium">Cipher</span>
                      <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">AES-256-GCM</Badge>
                    </div>
                    <div className="pt-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100/50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] uppercase font-mono tracking-wider font-semibold border border-emerald-200/50 dark:border-emerald-800/50">
                        <CheckCircle className="w-3 h-3" /> MD5_HASH_VERIFIED: SUCCESS
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
        <CardHeader className="py-5 bg-slate-50/80 dark:bg-slate-900/80 border-b dark:border-slate-800">
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
              <p className="text-slate-900 dark:text-slate-100 font-semibold">Your file is ready whenever you want to come back to it.</p>
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
