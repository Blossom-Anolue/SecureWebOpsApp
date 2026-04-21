import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Download, Share2, FileText, Lock, Trash2, Loader2, FileUp, RefreshCw, UploadCloud, Search } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import FileSharing from '@/pages/FileSharing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActivityLogger } from '@/hooks/useActivityLog';

export default function PDFDecryptionDownload() {
    const { session, user } = useAuth();
    const [files, setFiles] = useState<any[]>([]);
    const [sharingFile, setSharingFile] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isClearingAll, setIsClearingAll] = useState(false);
    const [decryptFile, setDecryptFile] = useState<{id: string, name: string} | null>(null);
    const [decryptEmail, setDecryptEmail] = useState('');
    const [isRecoverOpen, setIsRecoverOpen] = useState(false);
    const [recoverFile, setRecoverFile] = useState<File | null>(null);
    const [isRecovering, setIsRecovering] = useState(false);
    const [isRecoverDragging, setIsRecoverDragging] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const { toast } = useToast();
    const { log } = useActivityLogger();
    const navigate = useNavigate();
    const filteredFiles = files.filter(item => item.file?.file_name?.toLowerCase().includes(searchQuery.toLowerCase()));
    const adminFiles = filteredFiles.filter((item) => item.permission_level === 'ADMIN' && item.file?.id);
    const ownedFiles = filteredFiles.filter((item) => item.owned);
    const sharedFiles = filteredFiles.filter((item) => !item.owned);

    const loadFiles = useCallback(async () => {
        if (!user?.id || !session?.access_token) return;
        setIsLoading(true);
        try {
            const response = await fetch('/api/pdf/files?limit=50', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to load encrypted files');
            }

            const formatted = (payload.files as any[] | undefined)?.map(item => {
                return {
                    owned: item.owned === true || String(item.permissionLevel || '').toUpperCase() === 'ADMIN',
                    permission_level: item.permissionLevel,
                    file: {
                        id: item.id,
                        file_name: item.originalFileName || item.name,
                        created_at: item.createdAt
                    }
                };
            }) || [];

            setFiles(formatted);
        } catch (error: any) {
            console.error("Error loading files:", error.message);
            toast({ title: "Error loading files", description: error.message, variant: "destructive", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
        } finally {
            setIsLoading(false);
        }
    }, [session?.access_token, user?.id, toast]); 

    const handleDownload = async (id: string, name: string, emailStr?: string) => {
        toast({ title: "Unlocking File", description: "Requesting decryption keys..." });
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/pdf/download/${id}`, {
                headers: { 
                  'Authorization': `Bearer ${session?.access_token}`,
                  'X-User-Email': emailStr || ''
                }
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || "Decryption failed");
            }
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            let downloadName = name.replace(/\.enc$/i, '');
            if (!downloadName.toLowerCase().endsWith('.pdf')) downloadName += '.pdf';
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
            log('FILE_DECRYPT_SUCCESS', 'file', {
                resourceId: id,
                details: { fileName: name, email: emailStr }
            });
            toast({ title: "Success", description: "File securely decrypted and downloaded.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
        } catch (err: any) {
            log('FILE_DECRYPT_FAILURE', 'file', {
                resourceId: id,
                details: { fileName: name, error: err.message, email: emailStr }
            });
            toast({ title: "Decryption Failed", description: err.message, variant: "destructive" });
        }
    };

    const handleDownloadRaw = async (id: string, name: string) => {
        toast({ title: "Downloading", description: "Fetching encrypted file..." });
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/pdf/raw/${id}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || "Download failed");
            }
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            let downloadName = name.replace(/\.enc$/i, '').replace(/\.pdf$/i, '');
            a.download = downloadName + '_encrypted.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
            log('FILE_DOWNLOAD_RAW' as any, 'file', {
                resourceId: id,
                details: { fileName: name }
            });
            toast({ title: "Success", description: "Raw encrypted file downloaded.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
        } catch (err: any) {
            log('FILE_DOWNLOAD_RAW_FAILURE' as any, 'file', { resourceId: id, details: { fileName: name, error: err.message } });
            toast({ title: "Download Failed", description: err.message, variant: "destructive" });
        }
    };

    const handleDelete = async (fileId: string, fileName: string) => {
        if (!window.confirm(`Are you sure you want to permanently delete "${fileName}"? This will permanently delete the encrypted file and revoke all shared access.`)) return;

        toast({ title: "Purging File...", description: `Deleting ${fileName} from the vault.`, className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/pdf/${fileId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.error || "Delete failed");
            }

            const payload = await res.json().catch(() => ({}));

            log('FILE_PURGED', 'file', {
                resourceId: fileId,
                details: { fileName }
            });

            toast({ 
                title: "File Purged", 
                description: "Document removed from secure storage." 
            }); 
            if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
                toast({ title: "Cleanup Warnings", description: payload.warnings.join(' | '), variant: "destructive" });
            }
            loadFiles(); // Refresh the list
        } catch (err: any) {
            toast({ 
                title: "Error", 
                description: err.message, 
                variant: "destructive" 
            });
        }
    };

    const handleClearAll = async () => {
        if (!adminFiles.length) return;

        const confirmed = window.confirm(`Are you sure you want to permanently delete all ${adminFiles.length} file${adminFiles.length === 1 ? '' : 's'} you own in the vault? Shared files will not be removed.`);
        if (!confirmed) return;

        setIsClearingAll(true);
        toast({
            title: "Clearing Vault...",
            description: `Removing ${adminFiles.length} owned file${adminFiles.length === 1 ? '' : 's'} from secure storage.`,
            className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto'
        });

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const accessToken = session?.access_token;

            if (!accessToken) {
                throw new Error("Your session has expired. Please sign in again.");
            }

            const failures: string[] = [];

            for (const item of adminFiles) {
                const res = await fetch(`/api/pdf/${item.file.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    failures.push(`${item.file.file_name}: ${errorData.details || errorData.error || 'Delete failed'}`);
                }
            }

            await loadFiles();

            if (failures.length > 0) {
                toast({
                    title: "Clear All Completed With Warnings",
                    description: failures.slice(0, 2).join(' | '),
                    variant: "destructive"
                });
                return;
            }

            log('FILE_PURGED', 'file', {
                details: { fileName: 'All Owned Files', count: adminFiles.length }
            });

            toast({
                title: "Vault Cleared",
                description: "All owned encrypted files were removed from the vault.",
                className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto'
            });
        } catch (err: any) {
            toast({
                title: "Clear All Failed",
                description: err.message || "Unable to clear the vault.",
                variant: "destructive"
            });
        } finally {
            setIsClearingAll(false);
        }
    };

    useEffect(() => { loadFiles(); }, [loadFiles]);

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

            const res = await fetch('/api/pdf/decrypt-external', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` },
                body: formData
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || "Recovery failed.");
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const contentDisposition = res.headers.get('Content-Disposition');
            let filename = `recovered_${recoverFile.name.replace(/\.enc$/i, '').replace(/_encrypted\.pdf$/i, '.pdf')}.pdf`;
            if (contentDisposition && contentDisposition.includes('filename=')) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match && match[1]) filename = match[1];
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            log('FILE_DECRYPT_SUCCESS' as any, 'file', {
                details: { fileName: filename, recovery: true }
            });
            
            toast({ title: "Recovery Successful", description: "Your file has been securely decrypted.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
            setIsRecoverOpen(false);
            setRecoverFile(null);
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

    const renderFileGroup = (items: any[], emptyMessage: string) => {
        if (items.length === 0) {
            return (
                <div className="rounded-b-xl border dark:border-slate-800/80 border-t-0 bg-slate-50 dark:bg-slate-900/30 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {emptyMessage}
                </div>
            );
        }

        const allSelected = items.length > 0 && items.every(i => selectedFiles.has(i.file.id));
        const anySelected = items.some(i => selectedFiles.has(i.file.id));

        return (
            <div className="grid gap-4 rounded-b-xl border dark:border-slate-800/80 border-t-0 bg-white dark:bg-slate-900/30 p-4">
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
                    <div key={item.file?.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border dark:border-slate-700/60 rounded-xl bg-white dark:bg-slate-900/50 shadow-sm hover:shadow-md hover:border-primary/40 dark:hover:border-primary/60 dark:hover:bg-slate-800/80 transition-all duration-300">
                        <div className="flex items-center gap-4 min-w-0">
                            <input 
                                type="checkbox"
                                checked={selectedFiles.has(item.file.id)}
                                onChange={() => toggleFileSelection(item.file.id)}
                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-primary focus:ring-primary cursor-pointer accent-primary shrink-0"
                            />
                            <div className="p-2 bg-slate-50 dark:bg-slate-800/80 dark:border dark:border-slate-700/50 rounded-lg">
                                <FileText className="text-primary w-6 h-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-slate-800 dark:text-slate-100">{item.file?.file_name}</p>
                                    <Badge variant="outline" className={item.owned ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}>
                                        {item.owned ? 'My File' : 'Shared With Me'}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                                        item.permission_level === 'ADMIN' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-800' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800'
                                    }`}>
                                        {item.permission_level}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        {item.owned ? 'Encrypted on ' : 'Shared on '}
                                        {new Date(item.file?.created_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            {(item.permission_level === 'VIEW' || item.permission_level === 'DOWNLOAD' || item.permission_level === 'ADMIN') && (
                                <>
                                    <button 
                                        onClick={() => setDecryptFile({id: item.file.id, name: item.file.file_name})} 
                                        className="p-2 hover:bg-primary/10 dark:hover:bg-primary/25 rounded-lg text-primary dark:text-primary transition-colors"
                                        title="Decrypt & Download"
                                    >
                                        <Download size={20}/>
                                        <span className="sr-only">Decrypt & Download</span>
                                    </button>
                                    {(item.permission_level === 'DOWNLOAD' || item.permission_level === 'ADMIN') && (
                                    <button 
                                        onClick={() => handleDownloadRaw(item.file.id, item.file.file_name)} 
                                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
                                        title="Download Raw Encrypted File"
                                    >
                                        <Lock size={20}/>
                                        <span className="sr-only">Download Raw Encrypted File</span>
                                    </button>
                                    )}
                                </>
                            )}
                            {item.permission_level === 'ADMIN' && (
                                <>
                                    <button 
                                        onClick={() => setSharingFile(item.file)} 
                                        className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400 transition-colors"
                                        title="File Sharing"
                                    >
                                        <Share2 size={20}/>
                                        <span className="sr-only">File Sharing</span>
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(item.file.id, item.file.file_name)} 
                                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-lg text-red-500 dark:text-red-400 transition-colors"
                                        title="Purge File"
                                    >
                                        <Trash2 size={20}/>
                                    </button>
                                </>
                            )}
                        {!item.owned && (
                            <button 
                                onClick={() => handleRemoveShared(item.file.id, item.file.file_name)} 
                                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-lg text-red-500 dark:text-red-400 transition-colors"
                                title="Remove from my vault"
                            >
                                <Trash2 size={20}/>
                            </button>
                        )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My Vault & Sharing</h2>
                    <p className="text-sm text-slate-500">Decrypt, share, and manage encrypted files already stored in the vault.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setIsRecoverOpen(true)}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Recover File
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/encrypt')}>
                        <FileUp className="w-4 h-4 mr-2" />
                        Encrypt New File
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleClearAll}
                        disabled={isLoading || isClearingAll || adminFiles.length === 0}
                    >
                        {isClearingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Clear All
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-8 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : files.length === 0 ? (
                <div className="text-center p-12 border-2 border-dashed rounded-xl bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700/60">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium">Vault is empty</p>
                    <p className="text-sm text-slate-400 mt-1">Files you upload or receive will appear here.</p>
                    <Button onClick={() => navigate('/encrypt')} className="mt-6 bg-primary hover:bg-primary/90 text-white">
                        <FileUp className="w-4 h-4 mr-2" />
                        Encrypt a File
                    </Button>
                </div>
            ) : (
                <Tabs defaultValue="my-files" className="w-full">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                        <TabsList className="grid w-full sm:w-[400px] grid-cols-2 shrink-0">
                            <TabsTrigger value="my-files" className="gap-2">
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
                                className="pl-9 bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 focus-visible:ring-primary w-full"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <TabsContent value="my-files" className="mt-0">
                        <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="rounded-t-xl border dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">My Files</h3>
                                        <p className="text-xs text-slate-500">Files you uploaded and fully manage.</p>
                                    </div>
                                    <Badge variant="outline" className="border-emerald-200 dark:border-emerald-800 bg-white dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">{ownedFiles.length}</Badge>
                                </div>
                            </div>
                            {renderFileGroup(ownedFiles, 'You have not uploaded any encrypted files yet.')}
                        </section>
                    </TabsContent>

                    <TabsContent value="shared" className="mt-0">
                        <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="rounded-t-xl border dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/20 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Shared With Me</h3>
                                        <p className="text-xs text-slate-500">Files other people have granted you access to.</p>
                                    </div>
                                    <Badge variant="outline" className="border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">{sharedFiles.length}</Badge>
                                </div>
                            </div>
                            {renderFileGroup(sharedFiles, 'Files shared with you will appear here.')}
                        </section>
                    </TabsContent>
                </Tabs>
            )}

            {sharingFile && (
                <FileSharing 
                    fileId={sharingFile.id} 
                    fileName={sharingFile.file_name} 
                    onClose={() => setSharingFile(null)} 
                />
            )}

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
                                    handleDownload(decryptFile!.id, decryptFile!.name, decryptEmail);
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

            <Dialog open={isRecoverOpen} onOpenChange={(open) => {
                if (!open) {
                    setIsRecoverOpen(false);
                    setRecoverFile(null);
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
                                id="recover-upload"
                            />
                            {!recoverFile && (
                                <label 
                                    htmlFor="recover-upload" 
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
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setIsRecoverOpen(false);
                            setRecoverFile(null);
                        }}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleRecoverFile}
                            disabled={!recoverFile || isRecovering}
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
        </div>
    );
}
