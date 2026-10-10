// Owner-confirmed fixed PST (UTC-8), not Los Angeles daylight time.
export const DARKPOOL_REVEAL_AT = Date.parse('2026-10-12T13:00:00-08:00');

export function getRevealCountdown(now: number) {
  const totalSeconds = Math.max(0, Math.ceil((DARKPOOL_REVEAL_AT - now) / 1000));
  return {
    ended: totalSeconds === 0,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}
