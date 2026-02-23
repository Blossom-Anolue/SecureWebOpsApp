import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface IndustryBenchmarkProps {
  userScore: number;
  industry?: string;
}

// Industry benchmark data (simulated averages)
const industryBenchmarks: Record<string, { average: number; topPerformers: number }> = {
  'Retail': { average: 62, topPerformers: 85 },
  'Healthcare': { average: 71, topPerformers: 92 },
  'Finance': { average: 78, topPerformers: 95 },
  'Technology': { average: 74, topPerformers: 91 },
  'Manufacturing': { average: 58, topPerformers: 82 },
  'Professional Services': { average: 65, topPerformers: 88 },
  'Education': { average: 55, topPerformers: 80 },
  'Other': { average: 60, topPerformers: 84 },
};

export function IndustryBenchmark({ userScore, industry = 'Other' }: IndustryBenchmarkProps) {
  const benchmark = industryBenchmarks[industry] || industryBenchmarks['Other'];
  
  const chartData = [
    { name: 'Your Score', score: userScore, type: 'user' },
    { name: 'Industry Avg', score: benchmark.average, type: 'average' },
    { name: 'Top 10%', score: benchmark.topPerformers, type: 'top' },
  ];

  const getBarColor = (type: string, score: number) => {
    if (type === 'user') {
      if (score >= 80) return 'hsl(var(--success))';
      if (score >= 50) return 'hsl(var(--warning))';
      return 'hsl(var(--destructive))';
    }
    if (type === 'average') return 'hsl(var(--muted-foreground))';
    return 'hsl(var(--primary))';
  };

  const scoreDiff = userScore - benchmark.average;
  const isAboveAverage = scoreDiff > 0;

  return (
    <Card variant="elevated" className="animate-slide-up">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Industry Comparison</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Compare your security score against other {industry.toLowerCase()} businesses. Benchmarks are based on anonymized industry data.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comparison Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-sm text-muted-foreground">vs {industry} Average</p>
            <p className={cn(
              "text-lg font-bold",
              isAboveAverage ? "text-success" : "text-destructive"
            )}>
              {isAboveAverage ? '+' : ''}{scoreDiff} points
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Percentile</p>
            <p className="text-lg font-bold text-foreground">
              {userScore >= benchmark.topPerformers ? 'Top 10%' : 
               userScore >= benchmark.average ? 'Above Avg' : 'Below Avg'}
            </p>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <XAxis 
                type="number" 
                domain={[0, 100]} 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                ticks={[0, 50, 100]}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                width={80}
              />
              <Bar 
                dataKey="score" 
                radius={[0, 4, 4, 0]}
                barSize={20}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getBarColor(entry.type, entry.score)} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-success" />
            <span className="text-muted-foreground">Your Score</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-muted-foreground" />
            <span className="text-muted-foreground">Industry Avg</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary" />
            <span className="text-muted-foreground">Top 10%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
