import { cn } from '@/lib/utils';

interface OnlineIndicatorProps {
  isOnline?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function OnlineIndicator({ isOnline = true, size = 'md', className }: OnlineIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  return (
    <span
      className={cn(
        'rounded-full inline-block',
        sizeClasses[size],
        isOnline ? 'bg-success animate-pulse' : 'bg-muted-foreground',
        className
      )}
    />
  );
}
