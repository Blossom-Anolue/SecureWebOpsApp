import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Download, Share2, FileText, Lock, Trash2, Loader2, FileUp } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import FileSharing from '@/pages/FileSharing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActivityLogger } from '@/hooks/useActivityLog';

export default function PDFDecryptionDownload() {
    const { session, user } = useAuth();
    const [files, setFiles] = useState<any[]>([]);
    const [sharingFile, setSharingFile] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isClearingAll, setIsClearingAll] = useState(false);
    const [decryptFile, setDecryptFile] = useState<{id: string, name: string} | null>(null);
    const [decryptEmail, setDecryptEmail] = useState('');
    const { toast } = useToast();
    const { log } = useActivityLogger();
    const navigate = useNavigate();
    const adminFiles = files.filter((item) => item.permission_level === 'ADMIN' && item.file?.id);
    const ownedFiles = files.filter((item) => item.owned);
    const sharedFiles = files.filter((item) => !item.owned);

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
            a.download = name.replace('.enc', '');
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
            a.download = name.endsWith('.enc') ? name : `${name}.enc`;
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

    const renderFileGroup = (items: any[], emptyMessage: string) => {
        if (items.length === 0) {
            return (
                <div className="rounded-b-xl border border-t-0 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    {emptyMessage}
                </div>
            );
        }

        return (
            <div className="grid gap-4 rounded-b-xl border border-t-0 bg-white p-4">
                {items.map(item => (
                    <div key={item.file?.id} className="flex items-center justify-between p-4 border rounded-xl bg-white shadow-sm hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <FileText className="text-primary w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-slate-800">{item.file?.file_name}</p>
                                    <Badge variant="outline" className={item.owned ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}>
                                        {item.owned ? 'My File' : 'Shared With Me'}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase border ${
                                        item.permission_level === 'ADMIN' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-blue-50 text-blue-600 border-blue-100'
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
                                        className="p-2 hover:bg-slate-100 rounded-lg text-primary transition-colors"
                                        title="Decrypt & Download"
                                    >
                                        <Download size={20}/>
                                        <span className="sr-only">Decrypt & Download</span>
                                    </button>
                                    {(item.permission_level === 'DOWNLOAD' || item.permission_level === 'ADMIN') && (
                                    <button 
                                        onClick={() => handleDownloadRaw(item.file.id, item.file.file_name)} 
                                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
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
                                        className="p-2 hover:bg-slate-100 rounded-lg text-blue-600 transition-colors"
                                        title="File Sharing"
                                    >
                                        <Share2 size={20}/>
                                        <span className="sr-only">File Sharing</span>
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(item.file.id, item.file.file_name)} 
                                        className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                                        title="Purge File"
                                    >
                                        <Trash2 size={20}/>
                                    </button>
                                </>
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
                    <h2 className="text-xl font-semibold text-slate-900">My Vault & Sharing</h2>
                    <p className="text-sm text-slate-500">Decrypt, share, and manage encrypted files already stored in the vault.</p>
                </div>
                <div className="flex flex-wrap gap-2">
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
                <div className="text-center p-12 border-2 border-dashed rounded-xl bg-slate-50">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium">Vault is empty</p>
                    <p className="text-sm text-slate-400 mt-1">Files you upload or receive will appear here.</p>
                    <Button onClick={() => navigate('/encrypt')} className="mt-6 bg-primary hover:bg-primary/90 text-white">
                        <FileUp className="w-4 h-4 mr-2" />
                        Encrypt a File
                    </Button>
                </div>
            ) : (
                <div className="space-y-6">
                    <section>
                        <div className="rounded-t-xl border bg-emerald-50/70 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-slate-900">My Files</h3>
                                    <p className="text-xs text-slate-500">Files you uploaded and fully manage.</p>
                                </div>
                                <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">{ownedFiles.length}</Badge>
                            </div>
                        </div>
                        {renderFileGroup(ownedFiles, 'You have not uploaded any encrypted files yet.')}
                    </section>

                    <section>
                        <div className="rounded-t-xl border bg-blue-50/70 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-slate-900">Shared With Me</h3>
                                    <p className="text-xs text-slate-500">Files other people have granted you access to.</p>
                                </div>
                                <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">{sharedFiles.length}</Badge>
                            </div>
                        </div>
                        {renderFileGroup(sharedFiles, 'Files shared with you will appear here.')}
                    </section>
                </div>
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
        </div>
    );
}
