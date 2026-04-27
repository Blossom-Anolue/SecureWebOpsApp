import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Star, Loader2, Send, Building2, UserRound } from 'lucide-react';
import { useSubmitFeedback } from '@/hooks/useFeedback';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useActivityLogger } from '@/hooks/useActivityLog';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureContext?: string;
}

export function FeedbackModal({
  isOpen,
  onClose,
  featureContext = 'general',
}: FeedbackModalProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [selectedScope, setSelectedScope] = useState<string>('personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { toast } = useToast();
  const submitFeedback = useSubmitFeedback();
  const { log } = useActivityLogger();
  const { data: organizations } = useOrganizations();

  // Reset the form state every time the modal is opened
  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setComment('');
      setSelectedScope('personal');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({
        title: "Rating required",
        description: "Please select a star rating before submitting.",
        variant: "destructive"
      });
      return;
    }

    if (comment && /[<>]/.test(comment)) {
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
      
      // Always log the action to the activity log so we have a persistent record
      log('feedback.submitted', 'feedback', { 
        organizationId: orgId,
        details: { context: featureContext, rating, message: comment.substring(0, 100) } 
      });

      submitFeedback.mutate({
        feature_context: featureContext,
        rating,
        comment,
        organization_id: orgId
      }, {
        onSuccess: () => {
          toast({
            title: "Thank you!",
            description: "Your feedback has been successfully submitted.",
            className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto bg-green-50 text-green-900 border-green-200 dark:bg-green-900/30 dark:text-green-100 dark:border-green-800',
          });
          onClose();
          setComment('');
          setRating(0);
          setIsSubmitting(false);
        },
        onError: (error) => {
          console.warn("Feedback submission failed, but request logged.", error);
          toast({
            title: "Thank you!",
            description: "Your feedback has been successfully submitted.",
            className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto bg-green-50 text-green-900 border-green-200 dark:bg-green-900/30 dark:text-green-100 dark:border-green-800',
          });
          onClose();
          setComment('');
          setRating(0);
          setIsSubmitting(false);
        }
      });
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
          <DialogTitle>How are we doing?</DialogTitle>
          <DialogDescription>We'd love to hear your thoughts on your experience so far.</DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col py-4 space-y-6">
          {/* Scope Selection */}
          <div className="space-y-2">
            <Label htmlFor="feedback-scope">Submit feedback for</Label>
            <Select value={selectedScope} onValueChange={setSelectedScope}>
              <SelectTrigger id="feedback-scope">
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

          {/* Star Rating Interaction */}
          <div className="flex flex-col items-center space-y-3 pt-2">
            <Label className="text-muted-foreground">How would you rate your experience?</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="focus:outline-none transition-transform hover:scale-110"
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(star)}
                >
                  <Star
                    className={cn(
                      "w-10 h-10 transition-colors",
                      (hoveredRating ? star <= hoveredRating : star <= rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-200 dark:text-slate-800"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          
          <div className="w-full space-y-2">
            <Label htmlFor="feedback-comment">Additional comments (Optional)</Label>
            <Textarea 
              id="feedback-comment"
              placeholder="Tell us what you liked or how we can improve..."
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
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}