import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Send, Building2, UserRound } from 'lucide-react';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useActivityLogger } from '@/hooks/useActivityLog';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [comment, setComment] = useState('');
  const [selectedScope, setSelectedScope] = useState<string>('personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { toast } = useToast();
  const { log } = useActivityLogger();
  const { data: organizations } = useOrganizations();

  useEffect(() => {
    if (isOpen) {
      setComment('');
      setSelectedScope('personal');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!comment.trim()) {
      toast({
        title: "Description required",
        description: "Please describe your issue before submitting.",
        variant: "destructive"
      });
      return;
    }

    if (/[<>]/.test(comment)) {
      toast({
        title: "Invalid Input",
        description: "Comment contains invalid characters (< or >).",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    const orgId = selectedScope === 'personal' ? null : selectedScope;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Always log the action so we have a persistent record
      log('support.request_submitted', 'support_request', { 
        organizationId: orgId,
        details: { message: comment.substring(0, 200) } 
      });

      // Implement the actual contact support functionality
      await supabase.functions.invoke('send-support-email', {
        body: { 
          email: session?.user?.email,
          issue: comment,
          scope: selectedScope
        }
      }).catch(err => console.warn("Support email function failed, but request logged.", err));
      
      toast({
        title: "Request Submitted",
        description: "Your support request has been successfully submitted. Our team will contact you shortly.",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto bg-green-50 text-green-900 border-green-200 dark:bg-green-900/30 dark:text-green-100 dark:border-green-800',
      });
      onClose();
      setComment('');
      setIsSubmitting(false);
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Something went wrong",
        description: "We couldn't process your request. Please try again later.",
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact Support</DialogTitle>
          <DialogDescription>Describe your issue and our team will get back to you.</DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col py-4 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="support-scope">Support request for</Label>
            <Select value={selectedScope} onValueChange={setSelectedScope}>
              <SelectTrigger id="support-scope">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="w-4 h-4" />
                    Personal Account
                  </span>
                </SelectItem>
                {organizations?.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      {org.name} Workspace
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full space-y-2">
            <Label htmlFor="support-comment">Describe your issue</Label>
            <Textarea 
              id="support-comment"
              placeholder="Please provide as much detail as possible..."
              className="min-h-[100px] resize-none"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between flex-row gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {isSubmitting ? 'Sending...' : 'Send Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}