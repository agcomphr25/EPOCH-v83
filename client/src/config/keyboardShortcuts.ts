export interface KeyboardShortcut {
  key: string;
  label: string;
  description: string;
  category: 'navigation' | 'actions' | 'view';
  requiresModifier: boolean;
}

export const KEYBOARD_SHORTCUTS: Record<string, KeyboardShortcut> = {
  GLOBAL_SEARCH: {
    key: 'e',
    label: 'Global Search',
    description: 'Open global search to find orders, customers, and more',
    category: 'navigation',
    requiresModifier: true,
  },
  TOGGLE_SIDEBAR: {
    key: 'b',
    label: 'Toggle Sidebar',
    description: 'Show or hide the sidebar navigation',
    category: 'view',
    requiresModifier: true,
  },
};

export function formatShortcut(shortcutKey: keyof typeof KEYBOARD_SHORTCUTS): string {
  const shortcut = KEYBOARD_SHORTCUTS[shortcutKey];
  if (!shortcut) return '';
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const modifier = shortcut.requiresModifier ? (isMac ? '⌘' : 'Ctrl+') : '';
  return `${modifier}${shortcut.key.toUpperCase()}`;
}
