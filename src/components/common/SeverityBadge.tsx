import { Badge } from '@/components/ui/badge';
import type { SeverityLevel } from '@/types';

interface SeverityBadgeProps {
  severity: SeverityLevel;
  showLabel?: boolean;
}

const severityConfig = {
  critical: { label: 'Critical', variant: 'critical' as const },
  high: { label: 'High', variant: 'high' as const },
  medium: { label: 'Medium', variant: 'medium' as const },
  low: { label: 'Low', variant: 'low' as const },
};

export function SeverityBadge({ severity, showLabel = true }: SeverityBadgeProps) {
  const config = severityConfig[severity];
  
  return (
    <Badge variant={config.variant}>
      {showLabel ? config.label : severity.charAt(0).toUpperCase()}
    </Badge>
  );
}
