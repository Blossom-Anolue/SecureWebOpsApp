import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Loader2, ShieldAlert, AlertTriangle, Download, Share2, Trash2, Lock, RefreshCw, UploadCloud, FileUp, Search, Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/common/LoadingState';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import FileSharing from './FileSharing';
import { useActivityLogger } from '@/hooks/useActivityLog';

export default function PDFDecryption() {
  const { user } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingFile, setSharingFile] = useState<any | null>(null);
  const [decryptFile, setDecryptFile] = useState<{id: string, name: string, action: 'view' | 'decrypt'} | null>(null);
  const [isRecoverOpen, setIsRecoverOpen] = useState(false);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [recoverFile, setRecoverFile] = useState<File | null>(null);
  const [recoverPassword, setRecoverPassword] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);
  const [isRecoverDragging, setIsRecoverDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
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

  const handleSecureAction = async (fileId: string, fileName: string, action: 'view' | 'decrypt') => {
    let viewWindow: Window | null = null;
    if (action === 'view') {
        viewWindow = window.open('', '_blank');
        if (viewWindow) {
            viewWindow.document.write('<div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#64748b;">Decrypting secure document...</div>');
            viewWindow.document.title = "Opening Secure Document";
        }
    }

    if (/[<>'"]/.test(decryptPassword)) {
        toast({ title: "Invalid Input", description: "Password contains dangerous characters.", variant: "destructive" });
        return;
    }

    toast({ title: action === 'view' ? "Opening File" : "Unlocking File", description: "Requesting decryption keys..." });
    try { 
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Authentication session not found.");
      
      const res = await fetch(`/api/pdf/download/${fileId}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: decryptPassword }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Decryption Key Rejected" }));
        throw new Error(errorData.error);
      }

      const rawBlob = await res.blob();
      const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(pdfBlob);
      
      if (action === 'view') {
          if (viewWindow) {
              viewWindow.location.href = url + '#toolbar=0&navpanes=0';
          } else {
              window.open(url + '#toolbar=0&navpanes=0', '_blank');
          }
      } else {
          const link = document.createElement('a');
          link.href = url;
          let downloadName = fileName.replace(/\.enc$/i, '');
          if (!downloadName.toLowerCase().endsWith('.pdf')) downloadName += '.pdf';
          link.download = downloadName;
          document.body.appendChild(link);
          link.click();
          link.remove(); 
          window.URL.revokeObjectURL(url); 
      }
      
      log('FILE_DECRYPT_SUCCESS', 'file', {
        resourceId: fileId,
        details: { fileName, email: user?.email, action }
      });
      toast({ title: "Success", description: action === 'view' ? "Document opened securely." : "Document decrypted securely." });
    } catch (error: any) {
      if (viewWindow) viewWindow.close();
      log('FILE_DECRYPT_FAILURE', 'file', {
        resourceId: fileId,
        details: { fileName, error: error.message, email: user?.email }
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
      let downloadName = fileName.replace(/\.enc$/i, '').replace(/\.pdf$/i, '');
      link.download = downloadName + '_encrypted.enc';
      document.body.appendChild(link);
      link.click();
      link.remove(); 
      window.URL.revokeObjectURL(url); 
      
      log('FILE_DOWNLOAD_RAW' as any, 'file', { resourceId: fileId, details: { fileName } });
      toast({ title: "Encrypted File Downloaded", description: "This file is locked and cannot be opened directly. Use 'Recover File' in the app to view it." });
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

  const handleRecoverDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsRecoverDragging(true);
  };

  const handleRecoverDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsRecoverDragging(false);
  };

  const handleRecoverDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsRecoverDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setRecoverFile(e.dataTransfer.files[0]);
    }
  };

  const handleRecoverFile = async () => {
    if (!recoverFile) return;
    setIsRecovering(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session has expired.");

      const formData = new FormData();
      formData.append('file', recoverFile);
      formData.append('password', recoverPassword);

      const res = await fetch('/api/pdf/decrypt-external', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Recovery failed.");
      }

      const rawBlob = await res.blob();
      const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `recovered_${recoverFile.name.replace(/_encrypted\.pdf$/i, '.pdf').replace(/\.enc$/i, '.pdf')}`;
      if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
      if (contentDisposition && contentDisposition.includes('filename=')) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      toast({ title: "Recovery Successful", description: "Your file has been securely decrypted.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
      setIsRecoverOpen(false);
      setRecoverFile(null);
      setRecoverPassword('');
    } catch (err: any) {
      toast({ title: "Recovery Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsRecovering(false);
    }
  };

  const handleRemoveShared = async (fileId: string, fileName: string) => {
    if (!window.confirm(`Are you sure you want to remove "${fileName}" from your vault? You will lose access to this shared file.`)) return;

    toast({ title: "Removing File...", description: `Removing ${fileName} from your vault.` });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/pdf/share/${fileId}/remove`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Removal failed");
      }

      toast({ title: "File Removed", description: "The shared document was removed from your vault." });
      loadFiles();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleFileSelection = (id: string) => {
      const next = new Set(selectedFiles);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedFiles(next);
  };

  const toggleAll = (items: any[]) => {
      const allIds = items.map(i => i.file.id);
      const allSelected = allIds.length > 0 && allIds.every(id => selectedFiles.has(id));
      const next = new Set(selectedFiles);
      if (allSelected) {
          allIds.forEach(id => next.delete(id));
      } else {
          allIds.forEach(id => next.add(id));
      }
      setSelectedFiles(next);
  };

  const handleBulkDelete = async (items: any[]) => {
      const idsToDelete = items.map(i => i.file.id).filter(id => selectedFiles.has(id));
      if (idsToDelete.length === 0) return;
      if (!window.confirm(`Are you sure you want to delete ${idsToDelete.length} selected file(s)?`)) return;

      setIsBulkDeleting(true);
      toast({ title: "Processing...", description: `Deleting ${idsToDelete.length} file(s).` });
      
      try {
          const { data: { session } } = await supabase.auth.getSession();
          let successCount = 0;
          let failCount = 0;

          for (const id of idsToDelete) {
              const file = items.find(f => f.file.id === id);
              if (!file) continue;
              const isOwned = file.owned || file.permission_level === 'ADMIN';
              const endpoint = isOwned ? `/api/pdf/${id}` : `/api/pdf/share/${id}/remove`;
              const res = await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${session?.access_token}` } });
              if (res.ok) {
                  successCount++;
                  log(isOwned ? 'FILE_PURGED' : ('SHARE_REMOVED' as any), 'file', { resourceId: id, details: { fileName: file.file.file_name } });
              } else {
                  failCount++;
              }
          }

          toast({ title: "Bulk Delete Complete", description: `Successfully removed ${successCount} file(s). ${failCount > 0 ? `Failed to remove ${failCount} file(s).` : ''}`, variant: failCount > 0 ? "destructive" : "default" });
          const next = new Set(selectedFiles);
          idsToDelete.forEach(id => next.delete(id));
          setSelectedFiles(next);
          loadFiles();
      } catch (error: any) {
          toast({ title: "Error", description: error.message || "Bulk deletion failed.", variant: "destructive" });
      } finally {
          setIsBulkDeleting(false);
      }
  };

  const filteredFiles = files.filter(item => item.file?.file_name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const ownedFiles = filteredFiles.filter(item => item.permission_level === 'ADMIN');
  const sharedFiles = filteredFiles.filter(item => item.permission_level !== 'ADMIN');

  const renderFileList = (items: any[], emptyTitle: string, emptyDesc: string) => {
    if (items.length === 0) {
      return (
        <div className="text-center p-16 border-2 border-dashed dark:border-slate-700/60 rounded-2xl bg-white dark:bg-slate-900/40 shadow-inner">
          <FileText className="mx-auto w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-bold text-lg">{emptyTitle}</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{emptyDesc}</p>
        </div>
      );
    }

    const allSelected = items.length > 0 && items.every(i => selectedFiles.has(i.file.id));
    const anySelected = items.some(i => selectedFiles.has(i.file.id));

    return (
      <div className="grid gap-3">
        <div className="flex items-center justify-between pb-2 border-b dark:border-slate-700/50">
            <label className="flex items-center gap-3 cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
                <input 
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleAll(items)}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                />
                Select All
            </label>
            {anySelected && (
                <Button variant="destructive" size="sm" onClick={() => handleBulkDelete(items)} disabled={isBulkDeleting} className="h-8">
                    {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Trash2 className="w-4 h-4 mr-2" />}
                    Delete Selected
                </Button>
            )}
        </div>
        {items.map(item => (
          <div key={item.file.id} className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-card border dark:border-slate-700/60 rounded-xl bg-white dark:bg-slate-900/50 shadow-sm hover:shadow-md hover:border-primary/40 dark:hover:border-primary/60 dark:hover:bg-slate-800/80 transition-all duration-300">
            <div className="flex items-center gap-4 min-w-0">
              <input 
                  type="checkbox"
                  checked={selectedFiles.has(item.file.id)}
                  onChange={() => toggleFileSelection(item.file.id)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-primary focus:ring-primary cursor-pointer accent-primary shrink-0"
              />
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 dark:border dark:border-slate-700/50 rounded-lg group-hover:bg-primary/10 transition-colors">
                <FileText className="text-slate-400 group-hover:text-primary" size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{item.file.file_name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border ${
                    item.permission_level === 'ADMIN' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-800' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800'
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
                onClick={() => setDecryptFile({id: item.file.id, name: item.file.file_name, action: 'view'})}
                className="h-9 gap-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200 hover:bg-primary hover:text-white dark:hover:bg-primary/80 transition-colors"
                disabled={item.permission_level !== 'VIEW' && item.permission_level !== 'DOWNLOAD' && item.permission_level !== 'DECRYPT' && item.permission_level !== 'ADMIN'}
              >
                <Eye size={14} />
                <span className="text-xs font-semibold">View</span>
              </Button>

              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setDecryptFile({id: item.file.id, name: item.file.file_name, action: 'decrypt'})}
                className="h-9 gap-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200 hover:bg-primary hover:text-white dark:hover:bg-primary/80 transition-colors"
                disabled={item.permission_level !== 'DECRYPT' && item.permission_level !== 'ADMIN'}
              >
                <Download size={14} />
                <span className="text-xs font-semibold">Decrypt</span>
              </Button>

              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleDownloadRaw(item.file.id, item.file.file_name)}
                className="h-9 gap-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200 hover:bg-slate-800 dark:hover:bg-slate-700 hover:text-white transition-colors"
                disabled={item.permission_level !== 'DOWNLOAD' && item.permission_level !== 'DECRYPT' && item.permission_level !== 'ADMIN'}
              >
                <Lock size={14} />
                <span className="text-xs font-semibold">Raw</span>
              </Button>

              {item.permission_level === 'ADMIN' && (
                <>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 dark:hover:text-blue-400" onClick={() => setSharingFile(item.file)}>
                    <Share2 size={16} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                    onClick={() => handleDelete(item.file.id, item.file.file_name)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
              {item.permission_level !== 'ADMIN' && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                  onClick={() => handleRemoveShared(item.file.id, item.file.file_name)}
                  title="Remove from my vault"
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
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
          <div className="flex justify-center gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsRecoverOpen(true)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Recover External File
            </Button>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-400 dark:border-amber-600 p-4 rounded-r-xl flex gap-4">
          <AlertTriangle className="text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200/90 leading-relaxed">
            Accessing these files requires appropriate permissions. 
            Every action, including decryption and sharing, is recorded in the SecureWebOps audit log.
          </p>
        </div>

        <Tabs defaultValue="owned" className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
            <TabsList className="grid w-full sm:w-[400px] grid-cols-2 shrink-0">
              <TabsTrigger value="owned" className="gap-2">
                My Files
                <Badge variant="secondary" className="px-1.5 py-0.5 text-[10px] leading-none rounded-full">{ownedFiles.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="shared" className="gap-2">
                Shared With Me
                <Badge variant="secondary" className="px-1.5 py-0.5 text-[10px] leading-none rounded-full">{sharedFiles.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search files..." 
                className="pl-9 pr-9 bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 focus-visible:ring-primary w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <TabsContent value="owned" className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {renderFileList(ownedFiles, 'Your Vault is Empty', 'Upload a document to get started.')}
          </TabsContent>

          <TabsContent value="shared" className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {renderFileList(sharedFiles, 'No Shared Files', 'Documents shared with you will appear here.')}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!decryptFile} onOpenChange={(open) => {
        if (!open) {
          setDecryptFile(null);
          setDecryptPassword('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{decryptFile?.action === 'view' ? 'Authorize View' : 'Authorize Decryption'}</DialogTitle>
            <DialogDescription>
              Please enter your account password to authorize {decryptFile?.action === 'view' ? 'securely viewing this document' : 'decrypting and downloading this document'}. This is a security measure to ensure you are the account owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="decrypt-password">Password</Label>
              <Input 
                id="decrypt-password"
                type="password" 
                placeholder="••••••••" 
                value={decryptPassword} 
                onChange={(e) => setDecryptPassword(e.target.value)} 
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDecryptFile(null);
              setDecryptPassword('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (decryptPassword) {
                  handleSecureAction(decryptFile!.id, decryptFile!.name, decryptFile!.action);
                  setDecryptFile(null);
                  setDecryptPassword('');
                }
              }}
              disabled={!decryptPassword}
            >
              {decryptFile?.action === 'view' ? 'Confirm & View' : 'Confirm & Decrypt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRecoverOpen} onOpenChange={(open) => {
        if (!open) {
          setIsRecoverOpen(false);
          setRecoverFile(null);
          setRecoverPassword('');
        }
      }}>
        <DialogContent className="sm:max-w-lg border-slate-200 dark:border-slate-800 shadow-xl">
          <DialogHeader>
            <DialogTitle>Recover Encrypted File</DialogTitle>
            <DialogDescription>
              Upload a raw encrypted file (e.g. <code className="text-xs bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-1 rounded">_encrypted.pdf</code>) to securely verify ownership and decrypt it.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div 
              className={`relative group border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center space-y-4 transition-all duration-300 ease-in-out ${
                recoverFile
                  ? 'border-primary bg-primary/5 shadow-inner' 
                  : isRecoverDragging
                  ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg'
                  : 'border-slate-300 dark:border-slate-700 hover:border-primary/50 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/80'
              }`}
              onDragOver={handleRecoverDragOver}
              onDragLeave={handleRecoverDragLeave}
              onDrop={handleRecoverDrop}
            >
              <div className={`absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none ${recoverFile ? 'opacity-100' : ''}`} />
              
              <div className={`p-4 rounded-full transition-transform duration-300 relative z-10 ${recoverFile ? 'bg-primary text-white scale-110 shadow-md' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:scale-110 group-hover:bg-primary/20 group-hover:text-primary'}`}>
                {recoverFile ? <FileText className="w-6 h-6" /> : <UploadCloud className="w-6 h-6" />}
              </div>
              
              <div className="text-center relative z-10">
                <p className="font-semibold text-base text-slate-800 dark:text-slate-200">
                  {recoverFile ? recoverFile.name : "Drag & drop your encrypted file here"}
                </p>
                {recoverFile && (
                  <p className="text-xs text-slate-500 mt-1">
                    {(recoverFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
              
              <input 
                type="file" 
                accept=".pdf,.enc" 
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setRecoverFile(e.target.files[0]);
                  }
                }}
                className="hidden" 
                id="recover-upload-alt"
              />
              {!recoverFile && (
                <label 
                  htmlFor="recover-upload-alt" 
                  className="relative z-10 px-6 py-2.5 rounded-full cursor-pointer text-sm font-medium bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary/30 hover:text-primary transition-all shadow-sm mt-2 inline-block"
                >
                  Browse Files
                </label>
              )}
              {recoverFile && (
                <button 
                  type="button" 
                  onClick={() => setRecoverFile(null)} 
                  className="text-xs text-red-500 hover:underline mt-3 relative z-10"
                >
                  Remove file
                </button>
              )}
            </div>

            <div className="space-y-2 mt-6 relative z-10 w-full max-w-sm mx-auto">
              <Label htmlFor="recover-password-alt">Confirm Password</Label>
              <Input 
                id="recover-password-alt"
                type="password" 
                placeholder="••••••••" 
                value={recoverPassword} 
                onChange={(e) => setRecoverPassword(e.target.value)} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsRecoverOpen(false);
              setRecoverFile(null);
              setRecoverPassword('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleRecoverFile}
              disabled={!recoverFile || !recoverPassword || isRecovering}
              className="bg-primary hover:bg-primary/90 text-white shadow-sm"
            >
              {isRecovering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Recovering...
                </>
              ) : (
                "Upload & Decrypt"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
