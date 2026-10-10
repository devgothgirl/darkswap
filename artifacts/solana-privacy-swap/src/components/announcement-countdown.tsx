// Production default. Keep the existing announcement dismissal history intact.
// Releasing the countdown requires explicit owner approval and a later code
// change to the boundary in vite.config.ts. Neither time nor an env flag releases it.
export const ANNOUNCEMENT_KEY = 'darkswap:darkpool-phase-2-litepaper-v2-dismissed';

export function AnnouncementCountdown() {
  return null;
}
