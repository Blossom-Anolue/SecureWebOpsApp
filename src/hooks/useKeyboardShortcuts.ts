/**
 * @fileoverview Keyboard Shortcuts Hook
 * 
 * This hook provides keyboard navigation shortcuts for power users.
 * Shortcuts allow quick access to common pages and actions without
 * using the mouse.
 * 
 * All shortcuts use Ctrl (or Cmd on Mac) as a modifier to avoid
 * conflicts with browser defaults.
 * 
 * @module hooks/useKeyboardShortcuts
 */

import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Defines a keyboard shortcut action.
 */
interface ShortcutAction {
  /** The key to press (lowercase) */
  key: string;
  /** Whether Ctrl/Cmd is required */
  ctrl?: boolean;
  /** Whether Shift is required */
  shift?: boolean;
  /** Human-readable description for help dialog */
  description: string;
  /** Function to execute when shortcut is triggered */
  action: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for registering and handling keyboard shortcuts.
 * 
 * Automatically sets up keyboard event listeners and cleans them up
 * when the component unmounts. Shortcuts are disabled when the user
 * is typing in an input field.
 * 
 * @returns Object containing the list of registered shortcuts
 * 
 * @example
 * function MyComponent() {
 *   const { shortcuts } = useKeyboardShortcuts();
 *   
 *   return (
 *     <div>
 *       {shortcuts.map(s => (
 *         <div key={s.key}>{s.description}</div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  /**
   * List of all registered keyboard shortcuts.
   * Each shortcut includes the key combination and the action to perform.
   */
  const shortcuts: ShortcutAction[] = [
    { 
      key: 'g', 
      ctrl: true, 
      description: 'Go to Dashboard', 
      action: () => navigate('/dashboard') 
    },
    { 
      key: 's', 
      ctrl: true, 
      shift: true, 
      description: 'Start New Scan', 
      action: () => navigate('/scans/new') 
    },
    { 
      key: 'h', 
      ctrl: true, 
      description: 'Scan History', 
      action: () => navigate('/scans') 
    },
    { 
      key: 'p', 
      ctrl: true, 
      description: 'Phishing Check', 
      action: () => navigate('/phishing/check') 
    },
    { 
      key: 't', 
      ctrl: true, 
      description: 'Training', 
      action: () => navigate('/training') 
    },
    { 
      key: ',', 
      ctrl: true, 
      description: 'Settings', 
      action: () => navigate('/settings') 
    },
  ];

  /**
   * Handles keydown events and triggers matching shortcuts.
   * Ignores events when user is typing in an input field.
   */
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in form fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Check each shortcut for a match
    for (const shortcut of shortcuts) {
      // Check if Ctrl/Cmd modifier matches
      const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : true;
      // Check if Shift modifier matches (must not be pressed if not required)
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      
      // If all conditions match, trigger the action
      if (event.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch && shiftMatch) {
        event.preventDefault(); // Prevent browser default action
        shortcut.action();
        return;
      }
    }
  }, [navigate]);

  /**
   * Set up event listener on mount and clean up on unmount.
   */
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts };
}
