import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from "@/hooks/use-toast";

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
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    if (!recipientInput) return;
    setIsSharing(true);

    try {
      const targetUserId = recipientInput.trim();

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/pdf/share/${fileId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({ targetUserId, level: 'DOWNLOAD', expiresAt: shareExpiresAt || null })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(getApiErrorMessage(errorData, "Permission update failed on server."));
      }

      toast({ 
        title: "Success", 
        description: `Access granted to ${targetUserId}` 
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

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-2xl">
        <div className="p-6 space-y-6">
          {/* Header */}
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
              <UserPlus className="text-primary" size={22} /> Share Document
            </DialogTitle>
            <DialogDescription className="text-sm mt-1 truncate">
              Managing: <span className="font-medium text-slate-700">{fileName}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Form Fields */}
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="recipient-input" className="text-xs font-bold uppercase tracking-tight text-slate-500">
                Recipient Email or User ID
              </Label>
              <Input 
                id="recipient-input"
                type="text" 
                placeholder="user@example.com OR User ID"
                className="w-full px-4 py-5 border-slate-200 rounded-xl focus-visible:ring-primary"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                For maximum security, sharing via User ID is recommended. Users can find their ID in Settings.
              </p>
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
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-tight text-slate-500">
                Permission Level
              </Label>
              <div className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 bg-primary/5 border-primary text-primary font-medium">
                <Download size={18} /> Download & Decrypt
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-slate-50 p-4 flex justify-end gap-3 border-t">
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
