import { Link } from 'wouter';
import { trackEvent, type SwapRoute } from '../lib/analytics';

type Route = 'private' | 'near' | 'bridge';

const routes: { id: Route; href: string; label: string; hint: string }[] = [
  { id: 'private', href: '/swap', label: 'Private route', hint: 'Automatic quotes' },
  { id: 'near', href: '/near-swap', label: 'Privacy swap', hint: 'NEAR Intents' },
  { id: 'bridge', href: '/bridge', label: 'Bridge', hint: 'Any network' },
];
/** Static analytics names only; never the URL or anything the user typed. */
const TAB_ROUTE: Record<Route, SwapRoute> = { private: 'private_route', near: 'privacy_swap', bridge: 'bridge' };

/** In-card switch between the live swap routes. Carries the typed amount across. */
export function RouteTabs({ active, amount }: { active: Route; amount?: string }) {
  const carry = amount && /^\d+(\.\d+)?$/.test(amount.trim()) ? `?amount=${encodeURIComponent(amount.trim())}` : '';
  return <nav className="sx-tabs" aria-label="Swap route">
    {routes.map(route => route.id === active
      ? <span key={route.id} className="sx-tab is-active" aria-current="page"><strong>{route.label}</strong><small>{route.hint}</small></span>
      : <Link key={route.id} href={`${route.href}${carry}`} className="sx-tab" onClick={() => trackEvent('swap_route_tab_clicked', { to_route: TAB_ROUTE[route.id] })} data-testid={`tab-route-${route.id}`}><strong>{route.label}</strong><small>{route.hint}</small></Link>)}
  </nav>;
}

/** Reads an amount carried over from the other route tab. Assets differ between routes, so only the amount moves. */
export function carriedAmount(): string {
  try {
    const value = new URLSearchParams(window.location.search).get('amount') || '';
    return /^\d+(\.\d+)?$/.test(value) && value.length <= 40 ? value : '';
  } catch { return ''; }
}
