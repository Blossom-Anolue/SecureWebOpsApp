import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from 'recharts';
import { format, subDays } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SecurityTrendsProps {
  data: { date: string; score: number }[];
}

export function SecurityTrends({ data }: SecurityTrendsProps) {
  const chartData = data.map(item => ({
    ...item,
    dateLabel: format(new Date(item.date), 'MMM d'),
    fullDate: format(new Date(item.date), 'MMM d, yyyy'),
  }));

  // Calculate trend
  const latestScore = data[data.length - 1]?.score ?? 0;
  const previousScore = data[data.length - 2]?.score ?? latestScore;
  const scoreDiff = latestScore - previousScore;
  
  // Calculate 7-day and 30-day averages if enough data
  const last7Days = data.slice(-7);
  const last30Days = data.slice(-30);
  const avg7Day = last7Days.length > 0 
    ? Math.round(last7Days.reduce((sum, d) => sum + d.score, 0) / last7Days.length)
    : null;
  const avg30Day = last30Days.length > 0
    ? Math.round(last30Days.reduce((sum, d) => sum + d.score, 0) / last30Days.length)
    : null;

  // Determine trend direction
  const getTrendIcon = () => {
    if (scoreDiff > 5) return <TrendingUp className="w-4 h-4 text-success" />;
    if (scoreDiff < -5) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getTrendText = () => {
    if (scoreDiff > 5) return 'Improving';
    if (scoreDiff < -5) return 'Declining';
    return 'Stable';
  };

  const getTrendColor = () => {
    if (scoreDiff > 5) return 'text-success';
    if (scoreDiff < -5) return 'text-destructive';
    return 'text-muted-foreground';
  };

  return (
    <Card variant="elevated" className="animate-slide-up">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Security Score History</CardTitle>
          <div className={cn("flex items-center gap-1.5 text-sm font-medium", getTrendColor())}>
            {getTrendIcon()}
            <span>{getTrendText()}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{latestScore}</p>
            <p className="text-xs text-muted-foreground">Current</p>
          </div>
          {avg7Day !== null && (
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold text-foreground">{avg7Day}</p>
              <p className="text-xs text-muted-foreground">7-Day Avg</p>
            </div>
          )}
          {avg30Day !== null && (
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold text-foreground">{avg30Day}</p>
              <p className="text-xs text-muted-foreground">30-Day Avg</p>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="dateLabel" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                ticks={[0, 50, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  padding: '8px 12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: '4px' }}
                formatter={(value: number) => [`Score: ${value}`, '']}
                labelFormatter={(_, payload) => payload[0]?.payload?.fullDate || ''}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#scoreGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>
            {data.length > 1 
              ? `${data.length} data points over ${Math.ceil((new Date(data[data.length - 1]?.date).getTime() - new Date(data[0]?.date).getTime()) / (1000 * 60 * 60 * 24))} days`
              : 'More data will appear after additional scans'
            }
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
