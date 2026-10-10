import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { getGetNearTokensQueryKey, useGetNearTokens } from '@workspace/api-client-react';
import type { NearToken } from '@workspace/api-client-react';
import { errorText } from './swap-ui';
import { compareDestinations } from '../lib/destination-sort';
import { networksOf, SOLANA_ORIGIN, sourceTokenParams, type NearFormMode } from '../lib/near-route-form';

/**
 * Asset list for one side of a NEAR Intents route. The destination, and the
 * bridge's origin, choose a network first; networks always come from the API.
 * The Privacy swap's origin stays a flat, server-searched list of Solana assets.
 */
export function NearAssetPicker({ mode, side, token, onPick, selectedSource }: { mode: NearFormMode; side: 'source' | 'destination'; token: NearToken | null; onPick: (token: NearToken) => void; selectedSource?: NearToken | null }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = setTimeout(() => setSearch(term.trim()), 250); return () => clearTimeout(timer); }, [term]);
  const destination = side === 'destination';
  const networkFirst = destination || mode === 'bridge';
  const params = destination ? { side } : sourceTokenParams(mode, search);
  const tokens = useGetNearTokens(params, { query: { queryKey: getGetNearTokensQueryKey(params), enabled: open, retry: 1, staleTime: 30_000 } });
  const all = tokens.data?.tokens || [];
  const networks = networksOf(all).sort(compareDestinations);
  const matchingNetworks = networks.filter(network => !term || `${network.name} ${network.id}`.toLowerCase().includes(term.toLowerCase()));
  // The Privacy swap's origin list keeps to Solana even if a catalog ever ignored chain=sol.
  const visible = all.filter(asset => (networkFirst || asset.chain === SOLANA_ORIGIN) && (!networkFirst || asset.chain === chain) && (!selectedSource || asset.id !== selectedSource.id) && (!networkFirst || !term || `${asset.symbol} ${asset.chainName} ${asset.id}`.toLowerCase().includes(term.toLowerCase())));
  const sideName = destination ? 'DESTINATION' : 'ORIGIN';
  const title = !networkFirst ? 'SOLANA ASSETS' : chain ? `${sideName} ASSETS` : `${sideName} NETWORKS`;
  // Keyboard users keep their place: closing returns to the trigger, a network step returns to search.
  const close = () => { setOpen(false); setChain(null); setTerm(''); setSearch(''); triggerRef.current?.focus(); };
  const showNetwork = (id: string | null) => { setChain(id); setTerm(''); searchRef.current?.focus(); };
  return <>
    <button ref={triggerRef} className="near-asset-trigger" type="button" aria-expanded={open} aria-label={`Choose ${side} asset`} onClick={() => { setOpen(!open);setChain(null);setTerm('');setSearch(''); }} data-testid={`button-near-${side}-asset`}>
      {token && <span className="near-token-glyph">{token.symbol.slice(0, 1)}</span>}
      <span>{token ? token.symbol : 'Select asset'}</span><ChevronDown size={14}/>
    </button>
    {open && <div className="near-picker" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <div className="near-picker-title"><span>{title}</span><button className="near-button near-button--text" type="button" onClick={close} aria-label="Close asset list" data-testid={`button-close-near-${side}-assets`}><X size={16}/></button></div>
      {networkFirst && chain && <button className="near-button near-button--text" type="button" onClick={() => showNetwork(null)}>← All networks</button>}
      <div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', top: 16, left: 12, color: '#9c74d7' }}/><input ref={searchRef} className="near-input" style={{ paddingLeft: 34 }} value={term} onChange={e => setTerm(e.target.value)} placeholder={networkFirst && !chain ? (destination ? 'Search destination networks' : 'Search origin networks') : 'Search assets'} aria-label={`Search ${side} assets`} autoFocus data-testid={`input-search-near-${side}`}/></div>
      <div className="near-picker-list" role="listbox" aria-label={`${side} assets`}>
        {tokens.isLoading || (!networkFirst && tokens.isFetching && search !== term.trim()) ? <><div className="near-skeleton"/><div className="near-skeleton"/></>
          : tokens.isError ? <div><p className="near-error" role="alert">{errorText(tokens.error)}</p><button className="near-button near-button--subtle" type="button" onClick={() => tokens.refetch()} data-testid={`button-retry-near-${side}-assets`}>Try again</button></div>
          : networkFirst && !chain ? matchingNetworks.length === 0 ? <p className="near-hint">{destination ? 'No supported destination networks found.' : 'No supported origin networks found.'}</p> : matchingNetworks.map(network => <button className="near-picker-item" role="option" aria-selected={false} key={network.id} type="button" onClick={() => showNetwork(network.id)} data-testid={`button-near-${side}-chain-${network.id}`}><span className="near-token-glyph">{network.name.slice(0, 1)}</span><span>{network.name}<small>View available assets</small></span><ChevronDown size={14}/></button>)
          : !visible.length ? <p className="near-hint" data-testid={`status-near-${side}-empty`}>No supported assets found. Try another search.</p>
          : visible.map(asset => <button className="near-picker-item" role="option" aria-selected={token?.id === asset.id} key={asset.id} type="button" onClick={() => { onPick(asset); close(); }} data-testid={`button-near-${side}-token-${asset.id}`}>
            <span className="near-token-glyph">{asset.symbol.slice(0, 1)}</span><span>{asset.symbol}<small>{asset.id}</small></span><em>{asset.chainName}</em>
          </button>)}
      </div>
      {networkFirst && <p className="near-hint">Availability for your selected pair is confirmed by a live quote.</p>}
    </div>}
  </>;
}
