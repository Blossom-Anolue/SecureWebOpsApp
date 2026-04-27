import { ArrowRight, AlertCircle, AlertTriangle, Info, ChevronRight, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Quick Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.slice(0, 3).map((rec) => {
          const config = priorityConfig[rec.priority];
          const Icon = config.icon;
          
          return (
            <div 
              key={rec.id}
              className="group flex items-start gap-3 p-3 rounded-xl border border-transparent bg-muted/30 hover:bg-muted/80 hover:border-primary/20 hover:shadow-sm transition-all duration-300 cursor-pointer"
            >
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors", config.bg)}>
                <Icon className={cn("w-5 h-5", config.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{rec.title}</h4>
                  <Badge variant="outline" className="text-[10px] py-0 h-4 bg-background/50 backdrop-blur-sm whitespace-nowrap">
                    {rec.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {rec.description}
                </p>
              </div>
              <div className="flex items-center justify-center pt-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                <ChevronRight className="w-4 h-4 text-primary" />
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
