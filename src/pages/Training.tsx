import { useState } from 'react';
import { GraduationCap, PlayCircle, CheckCircle2, Clock, Users, Mail, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { mockTrainingLessons, mockSimulations } from '@/lib/mock-data';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function Training() {
  const [activeTab, setActiveTab] = useState('lessons');
  
  const completedLessons = mockTrainingLessons.filter(l => l.completed).length;
  const completionRate = (completedLessons / mockTrainingLessons.length) * 100;

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-display">Security Training</h1>
        <p className="text-muted-foreground mt-1">
          Learn to protect your business and test your team
        </p>
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Your Training Progress</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {completedLessons} of {mockTrainingLessons.length} lessons completed
              </p>
              <Progress value={completionRate} className="h-2" />
            </div>
            <div className="text-3xl font-bold text-primary">
              {Math.round(completionRate)}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lessons" className="gap-2">
            <PlayCircle className="w-4 h-4" />
            Lessons
          </TabsTrigger>
          <TabsTrigger value="simulations" className="gap-2">
            <Mail className="w-4 h-4" />
            Simulations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lessons" className="mt-6">
          <div className="space-y-3">
            {mockTrainingLessons.map((lesson) => (
              <Card 
                key={lesson.id} 
                variant="interactive"
                className={cn(lesson.completed && "opacity-75")}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-4">
                    {/* Status Icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      lesson.completed ? "bg-score-ok-bg" : "bg-muted"
                    )}>
                      {lesson.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-score-ok" />
                      ) : (
                        <PlayCircle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold">{lesson.title}</h3>
                        {lesson.completed && (
                          <Badge variant="low">Completed</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{lesson.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {lesson.duration}
                        </span>
                        <Badge variant="secondary" className="text-xs">{lesson.category}</Badge>
                      </div>
                    </div>

                    {/* Action */}
                    <Button 
                      variant={lesson.completed ? "outline" : "default"}
                      size="sm"
                    >
                      {lesson.completed ? 'Review' : 'Start'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="simulations" className="mt-6 space-y-6">
          {/* Info Card */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <h3 className="font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                What are phishing simulations?
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Test your team's ability to spot fake emails by sending simulated phishing attempts. 
                This helps identify who needs more training without any real risk.
              </p>
            </CardContent>
          </Card>

          {/* Simulations List */}
          <div className="space-y-3">
            {mockSimulations.map((sim) => (
              <Card key={sim.id} variant="elevated">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-muted-foreground" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold">{sim.name}</h3>
                        <Badge variant={sim.status === 'completed' ? 'low' : sim.status === 'running' ? 'medium' : 'secondary'}>
                          {sim.status.charAt(0).toUpperCase() + sim.status.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Template: {sim.template}</p>
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {sim.recipients} recipients
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(sim.scheduledFor), 'MMM d, yyyy')}
                        </span>
                        {sim.clickRate !== undefined && (
                          <span className="font-medium text-severity-high">
                            {sim.clickRate}% clicked
                          </span>
                        )}
                      </div>
                    </div>

                    <Button variant="outline" size="sm">
                      {sim.status === 'completed' ? 'View Results' : 'Details'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button className="w-full">
            <Mail className="w-4 h-4 mr-2" />
            Create New Simulation
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
