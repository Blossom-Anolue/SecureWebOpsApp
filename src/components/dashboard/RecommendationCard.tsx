import { ArrowRight, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Recommendation } from '@/types';
import { cn } from '@/lib/utils';

interface RecommendationCardProps {
  recommendations: Recommendation[];
}

const priorityConfig = {
  high: { icon: AlertCircle, color: 'text-severity-critical', bg: 'bg-severity-critical-bg' },
  medium: { icon: AlertTriangle, color: 'text-severity-medium', bg: 'bg-severity-medium-bg' },
  low: { icon: Info, color: 'text-severity-low', bg: 'bg-severity-low-bg' },
};

export function RecommendationCard({ recommendations }: RecommendationCardProps) {
  return (
    <Card variant="elevated" className="animate-slide-up">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quick Recommendations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.slice(0, 3).map((rec) => {
          const config = priorityConfig[rec.priority];
          const Icon = config.icon;
          
          return (
            <div 
              key={rec.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.bg)}>
                <Icon className={cn("w-4 h-4", config.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm">{rec.title}</h4>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {rec.description}
                </p>
              </div>
            </div>
          );
        })}
        
        <Button variant="ghost" className="w-full mt-2 text-primary">
          View all recommendations
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
