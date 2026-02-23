import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Keyboard } from 'lucide-react';

const shortcuts = [
  { keys: ['Ctrl', 'K'], description: 'Command Palette' },
  { keys: ['Ctrl', 'G'], description: 'Go to Dashboard' },
  { keys: ['Ctrl', 'Shift', 'S'], description: 'Start New Scan' },
  { keys: ['Ctrl', 'H'], description: 'Scan History' },
  { keys: ['Ctrl', 'P'], description: 'Phishing Check' },
  { keys: ['Ctrl', 'T'], description: 'Training' },
  { keys: ['Ctrl', ','], description: 'Settings' },
  { keys: ['?'], description: 'Show Shortcuts' },
];

interface KeyboardShortcutsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Keyboard shortcuts">
          <Keyboard className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.description} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{shortcut.description}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, index) => (
                  <span key={index}>
                    <kbd className="px-2 py-1 text-xs font-semibold bg-muted border border-border rounded">
                      {key}
                    </kbd>
                    {index < shortcut.keys.length - 1 && (
                      <span className="mx-1 text-muted-foreground">+</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Press <kbd className="px-1.5 py-0.5 text-xs bg-muted border border-border rounded">?</kbd> anytime to show this dialog
        </p>
      </DialogContent>
    </Dialog>
  );
}
