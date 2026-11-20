import { useSyncExternalStore } from 'react';

// A viewing preference for this page session, independent of document contents.
let enabled = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => enabled;
export function setVisibilityLighting(next: boolean) {
  if (enabled === next) return;
  enabled = next;
  listeners.forEach(listener => listener());
}
export function useVisibilityLighting() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
