import { useState } from 'react';
import { Calendar, Clock, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { 
  useScanSchedules, 
  useCreateScanSchedule, 
  useUpdateScanSchedule, 
  useDeleteScanSchedule,
  type Domain,
  type ScanSchedule 
} from '@/hooks/useSecurityData';
import { format } from 'date-fns';

interface ScanScheduleCardProps {
  domains: Domain[];
}

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

export function ScanScheduleCard({ domains }: ScanScheduleCardProps) {
  const { data: schedules, isLoading } = useScanSchedules();
  const createSchedule = useCreateScanSchedule();
  const updateSchedule = useUpdateScanSchedule();
  const deleteSchedule = useDeleteScanSchedule();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [scanType, setScanType] = useState<'quick' | 'full'>('quick');

  const handleCreateSchedule = async () => {
    if (!selectedDomain) {
      toast({
        title: "Select a domain",
        description: "Please select a domain to schedule scans for.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createSchedule.mutateAsync({
        domain_id: selectedDomain,
        frequency,
        day_of_week: frequency === 'weekly' ? parseInt(dayOfWeek) : undefined,
        day_of_month: frequency === 'monthly' ? parseInt(dayOfMonth) : undefined,
        scan_type: scanType,
      });

      setIsAddOpen(false);
      setSelectedDomain('');
      toast({
        title: "Schedule created",
        description: "Your automatic scan schedule has been set up.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message?.includes('unique') 
          ? "A schedule already exists for this domain."
          : "Failed to create schedule. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (schedule: ScanSchedule) => {
    try {
      await updateSchedule.mutateAsync({
        id: schedule.id,
        updates: { is_active: !schedule.is_active },
      });
      toast({
        title: schedule.is_active ? "Schedule paused" : "Schedule activated",
        description: schedule.is_active 
          ? "Automatic scans have been paused."
          : "Automatic scans will resume.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update schedule.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSchedule.mutateAsync(id);
      toast({
        title: "Schedule deleted",
        description: "The scan schedule has been removed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete schedule.",
        variant: "destructive",
      });
    }
  };

  const getScheduleDescription = (schedule: ScanSchedule) => {
    if (schedule.frequency === 'weekly') {
      const day = DAYS_OF_WEEK.find(d => d.value === String(schedule.day_of_week));
      return `Every ${day?.label || 'week'}`;
    }
    return `Monthly on day ${schedule.day_of_month}`;
  };

  // Filter out domains that already have schedules
  const availableDomains = domains.filter(
    d => !schedules?.some(s => s.domain_id === d.id)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Scheduled Scans
        </CardTitle>
        <CardDescription>
          Set up automatic security scans for your domains
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : schedules && schedules.length > 0 ? (
          schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {schedule.domains?.domain || 'Unknown domain'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {getScheduleDescription(schedule)}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {schedule.scan_type}
                  </Badge>
                </div>
                {schedule.next_run_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Next: {format(new Date(schedule.next_run_at), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Switch
                  checked={schedule.is_active}
                  onCheckedChange={() => handleToggleActive(schedule)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(schedule.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No scheduled scans. Set up automatic scanning to stay protected.
          </p>
        )}

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full"
              disabled={availableDomains.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              {availableDomains.length === 0 ? 'All domains scheduled' : 'Add Schedule'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Automatic Scans</DialogTitle>
              <DialogDescription>
                Set up recurring security scans for your domain.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDomains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as 'weekly' | 'monthly')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>Day of Month</Label>
                  <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_MONTH.map((day) => (
                        <SelectItem key={day.value} value={day.value}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Scan Type</Label>
                <Select value={scanType} onValueChange={(v) => setScanType(v as 'quick' | 'full')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quick">Quick Scan</SelectItem>
                    <SelectItem value="full">Full Scan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSchedule} disabled={createSchedule.isPending}>
                {createSchedule.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Schedule'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
