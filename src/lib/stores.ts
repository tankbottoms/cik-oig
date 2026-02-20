import { writable } from 'svelte/store';
import type { LogLine, ExtractedNameResult } from './types';

export const logLines = writable<LogLine[]>([]);
export const extractedNames = writable<ExtractedNameResult[]>([]);
export const isSearching = writable(false);

export function addLog(text: string, type: LogLine['type'] = 'info', url?: string) {
  logLines.update(lines => [...lines, { timestamp: Date.now(), text, type, url }]);
}

export function clearLog() {
  logLines.set([]);
  // Keep pinned names, clear unpinned
  extractedNames.update(names => names.filter(n => n.pinned));
}

export function clearAll() {
  logLines.set([]);
  extractedNames.update(names => names.filter(n => n.pinned));
}
