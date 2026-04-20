import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Loader2, ShieldAlert, AlertTriangle, Download, Share2, Trash2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/common/LoadingState';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FileSharing from './FileSharing';
import { useActivityLogger } from '@/hooks/useActivityLog';

export default function PDFDecryption() {
  const { user } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingFile, setSharingFile] = useState<any | null>(null);
  const [decryptFile, setDecryptFile] = useState<{id: string, name: string} | null>(null);
  const [decryptEmail, setDecryptEmail] = useState('');
  const { log } = useActivityLogger();

  const loadFiles = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let permissionsResponse = await (supabase as any)
        .from('file_permissions')
        .select(`
          permission_level,
          expires_at,
          revoked_at,
          created_at,
          files:file_id ( id, file_name, created_at )
        `)
        .eq('user_id', user.id);

      if (permissionsResponse.error) {
        permissionsResponse = await (supabase as any)
          .from('file_permissions')
          .select(`
            permission_level,
            created_at,
            files:file_id ( id, file_name, created_at )
          `)
          .eq('user_id', user.id);
      }

      const ownedFilesResponse = await (supabase as any)
        .from('files')
        .select('id, file_name, created_at')
        .eq('owner_id', user.id);
      
      if (permissionsResponse.error) throw permissionsResponse.error;
      if (ownedFilesResponse.error) throw ownedFilesResponse.error;

      const sharedFiles = (permissionsResponse.data as any[])?.map(item => {
        if (item.revoked_at) return null;
        if (item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) return null;

        const fileData = Array.isArray(item.files) ? item.files[0] : item.files;
        return {
          permission_level: item.permission_level || 'VIEW',
          file: {
            ...fileData,
            created_at: item.created_at || fileData.created_at
          }
        };
      }).filter(item => item != null && item.file != null) || [];

      const ownedFiles = (ownedFilesResponse.data as any[])?.map(file => ({
        permission_level: 'ADMIN',
        file: file
      })) || [];

      const allFilesMap = new Map();
      [...ownedFiles, ...sharedFiles].forEach(item => {
        if (!allFilesMap.has(item.file.id) || item.permission_level === 'ADMIN') {
          allFilesMap.set(item.file.id, item);
        }
      });

      const formatted = Array.from(allFilesMap.values()).sort((a, b) => 
        new Date(b.file.created_at).getTime() - new Date(a.file.created_at).getTime()
      );

      setFiles(formatted);
    } catch (err: any) {
      toast({ title: "Error", description: "Could not load your vault.", variant: "destructive" });
    } finally { 
      setLoading(false); 
    } 
  }, [user?.id]); 

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDownloadAndDecrypt = async (fileId: string, fileName: string, userEmail: string) => {
    toast({ title: "Unlocking File", description: "Requesting decryption keys..." });
    try { 
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session not found.");
      
      const res = await fetch(`/api/pdf/download/${fileId}`, {
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'X-User-Email': userEmail, // Pass the email for secure access tracking
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Decryption Key Rejected" }));
        throw new Error(errorData.error);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName.replace('.enc', '');
      document.body.appendChild(link);
      link.click();
      link.remove(); 
      window.URL.revokeObjectURL(url); 
      
      log('FILE_DECRYPT_SUCCESS', 'file', {
        resourceId: fileId,
        details: { fileName, email: userEmail }
      });
      toast({ title: "Success", description: "Document decrypted securely." });
    } catch (error: any) {
      log('FILE_DECRYPT_FAILURE', 'file', {
        resourceId: fileId,
        details: { fileName, error: error.message, email: userEmail }
      });
      toast({ title: "Decryption Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDownloadRaw = async (fileId: string, fileName: string) => {
    toast({ title: "Downloading", description: "Fetching encrypted file..." });
    try { 
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session not found.");
      
      const res = await fetch(`/api/pdf/raw/${fileId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Download Failed" }));
        throw new Error(errorData.error);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName.endsWith('.enc') ? fileName : `${fileName}.enc`;
      document.body.appendChild(link);
      link.click();
      link.remove(); 
      window.URL.revokeObjectURL(url); 
      
      log('FILE_DOWNLOAD_RAW' as any, 'file', { resourceId: fileId, details: { fileName } });
      toast({ title: "Success", description: "Raw encrypted file downloaded." });
    } catch (error: any) {
      log('FILE_DOWNLOAD_RAW_FAILURE' as any, 'file', { resourceId: fileId, details: { fileName, error: error.message } });
      toast({ title: "Download Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${fileName}"? This action cannot be undone.`)) {
      return;
    }

    toast({ title: "Purging File...", description: `Deleting ${fileName} from the vault.`, className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session not found.");

      const res = await fetch(`/api/pdf/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to delete file." }));
        throw new Error(errorData.details || errorData.error || "Deletion failed due to a server error.");
      }

      const payload = await res.json().catch(() => ({}));

      log('FILE_PURGED', 'file', {
        resourceId: fileId,
        details: { fileName }
      });
      toast({ title: "File Purged", description: `${fileName} has been permanently deleted.` });
      if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        toast({ title: "Cleanup Warnings", description: payload.warnings.join(' | '), variant: "destructive" });
      }
      loadFiles(); // Refresh 
    } catch (err: any) {
      toast({ title: "Deletion Failed", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <LoadingState message="Unlocking secure vault..." />;
  }

  return (
    <>
      {sharingFile && (
        <FileSharing 
            fileId={sharingFile.id} 
            fileName={sharingFile.file_name} 
            onClose={() => {
              setSharingFile(null);
              loadFiles();
            }} 
        />
      )}
      <div className="max-w-4xl mx-auto py-8 space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-2">
          <ShieldAlert className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold font-display">Secure File Vault</h1>
          <p className="text-muted-foreground">Retrieve, share, and manage encrypted documents</p>
        </div>

        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-xl flex gap-4">
          <AlertTriangle className="text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Accessing these files requires appropriate permissions. 
            Every action, including decryption and sharing, is recorded in the SecureWebOps audit log.
          </p>
        </div>

        <div className="grid gap-3">
          {files.length > 0 ? files.map(item => (
            <div key={item.file.id} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-card border rounded-xl shadow-sm hover:border-primary/50 transition-all">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-50 rounded-lg group-hover:bg-primary/10 transition-colors">
                  <FileText className="text-slate-400 group-hover:text-primary" size={24} />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800">{item.file.file_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${
                      item.permission_level === 'ADMIN' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                    }`}>
                      {item.permission_level}
                    </span>
                    <span className="text-xs text-slate-400">
                      {item.permission_level === 'ADMIN' ? 'Encrypted on ' : 'Shared on '}
                      {new Date(item.file.created_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setDecryptFile({id: item.file.id, name: item.file.file_name})}
                  className="h-9 gap-2 border-slate-200 hover:bg-primary hover:text-white transition-colors"
                  disabled={item.permission_level !== 'VIEW' && item.permission_level !== 'DOWNLOAD' && item.permission_level !== 'ADMIN'}
                >
                  <Download size={14} />
                  <span className="text-xs font-semibold">Decrypt</span>
                </Button>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleDownloadRaw(item.file.id, item.file.file_name)}
                  className="h-9 gap-2 border-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                  disabled={item.permission_level !== 'DOWNLOAD' && item.permission_level !== 'ADMIN'}
                >
                  <Lock size={14} />
                  <span className="text-xs font-semibold">Raw</span>
                </Button>

                {item.permission_level === 'ADMIN' && (
                  <>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => setSharingFile(item.file)}>
                      <Share2 size={16} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-9 w-9 text-slate-400 hover:text-red-500 hover:bg-red-50"
                      onClick={() => handleDelete(item.file.id, item.file.file_name)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )) : (
            <div className="text-center p-16 border-2 border-dashed rounded-2xl bg-white shadow-inner">
              <FileText className="mx-auto w-12 h-12 text-slate-200 mb-3" />
              <p className="text-slate-500 font-bold text-lg">Your Vault is Empty</p>
              <p className="text-sm text-slate-400 mt-1">Upload a document to get started.</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!decryptFile} onOpenChange={(open) => {
        if (!open) {
          setDecryptFile(null);
          setDecryptEmail('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Identity</DialogTitle>
            <DialogDescription>
              Please enter your email address to proceed with decryption. This ensures secure access tracking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="decrypt-email" className="text-xs font-bold uppercase tracking-tight text-slate-500">Email Address</Label>
              <Input 
                id="decrypt-email"
                type="email" 
                placeholder="your.email@example.com" 
                value={decryptEmail} 
                onChange={(e) => setDecryptEmail(e.target.value)} 
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDecryptFile(null);
              setDecryptEmail('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (decryptEmail) {
                      if (user?.email && decryptEmail.toLowerCase() !== user.email.toLowerCase()) {
                        toast({ 
                          title: "Verification Failed", 
                          description: "The email address entered does not match your account's registered email.", 
                          variant: "destructive" 
                        });
                        return;
                      }
                  handleDownloadAndDecrypt(decryptFile!.id, decryptFile!.name, decryptEmail);
                  setDecryptFile(null);
                  setDecryptEmail('');
                }
              }}
              disabled={!decryptEmail}
            >
              Confirm & Decrypt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
