import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface TrendChartProps {
  data: { date: string; score: number; id?: string }[];
}

export function TrendChart({ data }: TrendChartProps) {
  const navigate = useNavigate();
  const chartData = data
    .map(item => ({
      ...item,
      timestamp: new Date(item.date).getTime(),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const handleClick = (state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
      const payload = state.activePayload[0].payload;
      if (payload.id) {
        navigate(`/scans/${payload.id}`);
      }
    }
  };

  return (
    <Card variant="elevated" className="animate-slide-up">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Score Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }} onClick={handleClick} style={{ cursor: 'pointer' }}>
              <XAxis 
                type="number"
                dataKey="timestamp" 
                domain={['dataMin', 'dataMax']}
                tickFormatter={(val) => format(new Date(val), 'MMM d')}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-md)',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [`${value}`, 'Score']}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Your security score over the past 2 weeks
        </p>
      </CardContent>
    </Card>
  );
}
