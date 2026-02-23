import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StatusCardProps {
  icon: LucideIcon;
  title: string;
  summary: string;
  summaryColor?: 'default' | 'warning' | 'danger' | 'success';
  primaryAction: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

const summaryColors = {
  default: 'text-foreground',
  warning: 'text-score-at-risk',
  danger: 'text-score-critical',
  success: 'text-score-ok',
};

export function StatusCard({ 
  icon: Icon, 
  title, 
  summary, 
  summaryColor = 'default',
  primaryAction,
  secondaryAction 
}: StatusCardProps) {
  return (
    <Card variant="elevated" className="animate-slide-up">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg mb-1">{title}</h3>
            <p className={cn("text-sm font-medium", summaryColors[summaryColor])}>
              {summary}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mt-4">
          <Button size="sm" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
          {secondaryAction && (
            <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
