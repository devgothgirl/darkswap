import { useEffect, useState } from 'react';
import { getRevealCountdown } from '../lib/darkpool-countdown';
import './darkpool-countdown.css';

export function DarkpoolCountdown() {
  const [remaining, setRemaining] = useState(() => getRevealCountdown(Date.now()));

  useEffect(() => {
    function refresh() {
      const next = getRevealCountdown(Date.now());
      setRemaining(next);
      return next.ended;
    }
    if (refresh()) return;
    const interval = window.setInterval(() => {
      if (refresh()) window.clearInterval(interval);
    }, 1000);
    // Recalculate from the clock after a background tab becomes visible.
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return (
    <section className="dk-countdown" aria-label="DarkPools reveal countdown" data-testid="darkpool-countdown">
      <p className="dk-countdown-heading">DarkPools reveal</p>
      {remaining.ended ? (
        <p className="dk-countdown-ended" role="status">Reveal time reached. Check X for updates.</p>
      ) : (
        <div className="dk-countdown-units" role="timer" aria-live="off">
          {(['days', 'hours', 'minutes', 'seconds'] as const).map(unit => (
            <div key={unit}>
              <strong data-testid={`countdown-${unit}`}>{String(remaining[unit]).padStart(2, '0')}</strong>
              <span>{unit}</span>
            </div>
          ))}
        </div>
      )}
      <p className="dk-countdown-date">
        <time dateTime="2026-10-12T13:00:00-08:00">Monday, Oct 12 · 1 p.m. PST (UTC−8)</time>
      </p>
    </section>
  );
}
