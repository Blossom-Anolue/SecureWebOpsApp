import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type FeedbackData = {
  feature_context: string;
  rating?: number | null;
  comment?: string;
  organization_id?: string | null;
};

export function useSubmitFeedback() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (feedback: FeedbackData) => {
      if (!user) throw new Error('User must be logged in to submit feedback');

      const { data, error } = await supabase
        .from('feedback')
        .insert({
          user_id: user.id,
          organization_id: feedback.organization_id || null,
          feature_context: feedback.feature_context,
          rating: feedback.rating ?? null,
          comment: feedback.comment || null,
        });

      if (error) {
        console.error('Feedback insert error:', error);
        throw error;
      }
      return data;
    }
  });
}