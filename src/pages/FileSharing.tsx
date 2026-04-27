import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, Loader2, Download, Eye, ShieldAlert, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from "@/hooks/use-toast";
import { useAuth } from '@/contexts/AuthContext';
import { useActivityLogger } from '@/hooks/useActivityLog';

interface FileSharingProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
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

export default function FileSharing({ fileId, fileName, onClose }: FileSharingProps) {
  const [recipientInput, setRecipientInput] = useState('');
  const [shareExpiresAt, setShareExpiresAt] = useState('');
  const [permissionLevel, setPermissionLevel] = useState('VIEW');
  const [isSharing, setIsSharing] = useState(false);
  const { log } = useActivityLogger();
  const { user } = useAuth();

  const handleShare = async () => {
    if (!recipientInput) return;

    if (/[<>]/.test(recipientInput)) {
      toast({ 
        title: "Invalid Input", 
        description: "Recipient contains invalid characters (< or >).", 
        variant: "destructive" 
      });
      return;
    }

    if (recipientInput.trim().toLowerCase() === user?.email?.toLowerCase()) {
      toast({ 
        title: "Notice", 
        description: "You already have owner access to this file." 
      });
      return;
    }

    setIsSharing(true);

    try {
      const targetUserId = recipientInput.trim();
      
      let expiresAtISO = null;
      if (shareExpiresAt) {
        const dateObj = new Date(shareExpiresAt);
        if (dateObj.getTime() <= Date.now()) {
          throw new Error("Share expiration must be in the future.");
        }
        expiresAtISO = dateObj.toISOString();
      }

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/pdf/share/${fileId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({ targetUserId, level: permissionLevel, expiresAt: expiresAtISO })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(getApiErrorMessage(errorData, "Permission update failed on server."));
      }

      const responseData = await response.json().catch(() => ({}));

      toast({ 
        title: responseData.message?.includes('already') ? "Notice" : "Success", 
        description: responseData.message || `Access granted to ${targetUserId}` 
      }); 
      
      setShareExpiresAt('');
      onClose(); 
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      }); 
    } finally {
      setIsSharing(false);
    }
  };

  // Calculate minimum datetime (current local time) to prevent selecting past dates
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDateTime = now.toISOString().slice(0, 16);

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-2xl">
        <div className="p-6 space-y-6">
          {/* Header */}
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <UserPlus className="text-primary" size={22} /> Share Document
            </DialogTitle>
            <DialogDescription className="text-sm mt-1 truncate dark:text-slate-400">
              Managing: <span className="font-medium text-slate-700 dark:text-slate-200">{fileName}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Form Fields */}
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="recipient-input" className="text-xs font-bold uppercase tracking-tight text-slate-500">
                Recipient Email or Username
              </Label>
              <Input 
                id="recipient-input"
                type="text" 
                placeholder="Enter Email or Username"
                className="w-full px-4 py-5 border-slate-200 rounded-xl focus-visible:ring-primary"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
              />
              <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-lg p-3 mt-2 space-y-2">
                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>For maximum security, carefully verify the recipient's Email or Username before sharing.</span>
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-blue-500 shrink-0" />
                  <span><strong>Enterprise DLP Active:</strong> Sharing may be restricted to approved company domains. "View Only" files will be dynamically watermarked.</span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="share-expires-at" className="text-xs font-bold uppercase tracking-tight text-slate-500">
                Share Expires At
              </Label>
              <Input
                id="share-expires-at"
                type="datetime-local"
                className="w-full px-4 py-5 border-slate-200 rounded-xl focus-visible:ring-primary"
                value={shareExpiresAt}
                onChange={(e) => setShareExpiresAt(e.target.value)}
                min={minDateTime}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-tight text-slate-500">
                Permission Level
              </Label>
            <Select value={permissionLevel} onValueChange={setPermissionLevel}>
              <SelectTrigger className="w-full h-12 bg-white dark:bg-slate-950 rounded-xl border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Select a permission level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VIEW">
                  <div className="flex items-center gap-2">
                    <Eye size={16} className="text-slate-500" />
                    <span>View Only (Browser)</span>
                  </div>
                </SelectItem>
                <SelectItem value="DOWNLOAD">
                  <div className="flex items-center gap-2">
                    <Lock size={16} className="text-slate-500" />
                    <span>Download (Raw Encrypted)</span>
                  </div>
                </SelectItem>
                <SelectItem value="DECRYPT">
                  <div className="flex items-center gap-2">
                    <Download size={16} className="text-slate-500" />
                    <span>Decrypt (Download Plaintext)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 flex justify-end gap-3 border-t dark:border-slate-800">
          <Button variant="outline" onClick={onClose} disabled={isSharing}>
            Cancel
          </Button>
          <Button 
            onClick={handleShare}
            disabled={!recipientInput || isSharing}
            className="bg-primary hover:bg-primary/90 text-white px-6 font-semibold"
          >
            {isSharing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Authorizing...
              </>
            ) : (
              "Grant Access"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
