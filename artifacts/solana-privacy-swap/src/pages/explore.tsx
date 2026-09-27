import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Database, RefreshCw, Search } from 'lucide-react';
import { Link } from 'wouter';
import { getDiscoverTokensQueryKey, getGetDiscoveredTokenQueryKey, useDiscoverTokens, useGetDiscoveredToken } from '@workspace/api-client-react';
import type { DiscoveryAsset } from '@workspace/api-client-react';
import { errorText, Footer, Header } from '../components/swap-ui';
import { isValidMint } from '../components/solana-wallet';

const money = (value?: number) => value == null ? '—' : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:value < 1 ? 6 : 2 }).format(value);
const compact = (value?: number) => value == null ? '—' : new Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:2 }).format(value);

function AssetIcon({ asset }: {asset: DiscoveryAsset}) {
  const [broken, setBroken] = useState(false);
  return <span className="token-avatar">{asset.icon && !broken ? <img src={asset.icon} alt="" onError={()=>setBroken(true)}/> : asset.symbol.slice(0,2).toUpperCase()}</span>;
}

export default function Explore() {
  const [term,setTerm] = useState('');
  const [search,setSearch] = useState('');
  const [selectedId,setSelectedId] = useState('');
  useEffect(()=>{ const timer=setTimeout(()=>setSearch(term.trim()),300); return ()=>clearTimeout(timer); },[term]);
  const params = {term:search};
  const list = useDiscoverTokens(params,{query:{queryKey:getDiscoverTokensQueryKey(params),enabled:!!search,staleTime:60_000}});
  const detail = useGetDiscoveredToken(selectedId,{query:{queryKey:getGetDiscoveredTokenQueryKey(selectedId),enabled:!!selectedId,staleTime:60_000}});
  const asset = detail.data?.asset;
  return <div className="app-shell"><Header/><main className="workspace-layout page-enter">
    <div className="eyebrow"><span className="eyebrow-line"/> DARKSWAP / ASSET INTELLIGENCE</div>
    <div className="workspace-heading"><h1>Know what<br/><span>you move.</span></h1><p>Search Solana assets and inspect market signals alongside available on-chain metadata. Research here does not connect a wallet or initiate a trade.</p></div>
    <div className="utility-grid">
      <section className="utility-panel" aria-label="Token search">
        <div className="utility-panel-head"><h2>Discover assets</h2><span className="card-subtitle">Solana / live search</span></div>
        <div className="utility-panel-body"><label className="section-label" htmlFor="explore-search">Search by name, symbol or mint</label><div className="search-wrap"><Search size={16}/><input id="explore-search" className="input-standard" type="search" placeholder="Try SOL, USDC, or a mint" value={term} onChange={e=>{setTerm(e.target.value);setSelectedId('');}} data-testid="input-explore-search"/></div></div>
        {!search ? <div className="blank-state"><Search size={24}/><strong>Start with an asset.</strong><p>Enter a token name, symbol or Solana mint to see matching market data.</p></div>
        : list.isLoading ? <div className="blank-state" data-testid="status-explore-loading"><div className="skeleton" style={{width:'85%',marginBottom:18}}/><div className="skeleton" style={{width:'65%',marginBottom:18}}/><div className="skeleton" style={{width:'77%'}}/></div>
        : list.isError ? <div className="blank-state" role="alert"><strong>Search unavailable.</strong><p className="quote-error">{errorText(list.error)}</p><button className="secondary-button" onClick={()=>list.refetch()} type="button" data-testid="button-retry-explore"><RefreshCw size={13}/> Try again</button></div>
        : !list.data?.assets.length ? <div className="blank-state" data-testid="status-explore-empty"><Search size={24}/><strong>No matches found.</strong><p>Check the spelling or search for a different asset.</p></div>
        : <div className="asset-list">{list.data.assets.map(item=><button key={item.assetId} type="button" className={`asset-row ${selectedId===item.assetId?'selected':''}`} onClick={()=>setSelectedId(item.assetId)} data-testid={`button-asset-${item.assetId}`}><AssetIcon asset={item}/><span style={{minWidth:0}}><span className="asset-symbol">{item.symbol}</span><span className="asset-name">{item.name}</span></span><span className="asset-side"><strong>{money(item.price)}</strong><small className={(item.change24h??0)>=0?'positive':'negative'}>{item.change24h == null ? '24H —' : `${item.change24h>=0?'+':''}${item.change24h.toFixed(2)}%`}</small></span></button>)}</div>}
      </section>
      <section className="utility-panel" aria-label="Asset details">
        {!selectedId ? <div className="blank-state" style={{minHeight:370,display:'flex',flexDirection:'column',justifyContent:'center'}}><Database size={28}/><strong>A closer look, before the route.</strong><p>Select an asset to inspect its market profile, mint and on-chain metadata.</p></div>
        : detail.isLoading ? <div className="blank-state" data-testid="status-detail-loading"><div className="skeleton" style={{width:'55%',height:26,marginBottom:24}}/><div className="skeleton" style={{width:'85%',marginBottom:20}}/><div className="skeleton" style={{width:'72%'}}/></div>
        : detail.isError || !asset ? <div className="blank-state" role="alert"><strong>Details unavailable.</strong><p className="quote-error">{errorText(detail.error)}</p><button type="button" className="secondary-button" onClick={()=>detail.refetch()} data-testid="button-retry-detail"><RefreshCw size={13}/> Try again</button></div>
        : <>
          <div className="data-feature"><span className="ticker">Asset profile / {asset.category || 'Solana'}</span><div style={{display:'flex',alignItems:'center',gap:15,marginTop:6}}><AssetIcon asset={asset}/><h2 data-testid="text-asset-name">{asset.name} <span style={{color:'#9eb5a8',fontSize:'.48em',letterSpacing:0}}>{asset.symbol}</span></h2></div><div style={{marginTop:16}}><span className="data-price" data-testid="text-asset-price">{money(asset.price)}</span><span className={`data-change ${(asset.change24h??0)>=0?'positive':'negative'}`}>{asset.change24h==null?'24H —':`${asset.change24h>=0?'+':''}${asset.change24h.toFixed(2)}% / 24H`}</span></div></div>
          <div className="data-grid">
            <div className="data-cell"><span>24h volume</span><strong>{asset.volume24h == null ? '—' : `$${compact(asset.volume24h)}`}</strong></div>
            <div className="data-cell"><span>Market cap</span><strong>{asset.marketCap == null ? '—' : `$${compact(asset.marketCap)}`}</strong></div>
            <div className="data-cell"><span>Liquidity</span><strong>{asset.liquidity == null ? '—' : `$${compact(asset.liquidity)}`}</strong></div>
            <div className="data-cell"><span>Trust tier</span><strong>{asset.trustTier || 'Not provided'}</strong></div>
            <div className="data-cell"><span>Supply</span><strong>{detail.data?.supply == null ? '—' : compact(detail.data.supply)}</strong></div>
            <div className="data-cell"><span>Decimals</span><strong>{detail.data?.decimals ?? '—'}</strong></div>
            <div className="data-cell"><span>On-chain name / symbol</span><strong>{detail.data?.onChainName || '—'} / {detail.data?.onChainSymbol || '—'}</strong></div>
            <div className="data-cell"><span>Metadata</span><strong>{detail.data?.metadataStatus === 'available' ? 'Available' : 'Unavailable'}</strong></div>
            <div className="data-cell"><span>Mint authority</span><strong>{detail.data?.mintAuthority || 'None reported'}</strong></div>
            <div className="data-cell"><span>Freeze authority</span><strong>{detail.data?.freezeAuthority || 'None reported'}</strong></div>
            <div className="data-cell" style={{gridColumn:'1 / -1'}}><span>Solana mint</span><strong>{asset.mint && isValidMint(asset.mint) ? <a href={`https://solscan.io/token/${asset.mint}`} target="_blank" rel="noopener noreferrer" data-testid="link-asset-mint">{asset.mint} <ArrowUpRight size={13} style={{display:'inline'}}/></a> : 'Not available'}</strong></div>
          </div>
          {detail.data?.description && <p className="context-note">{detail.data.description}</p>}
          <div style={{padding:'0 29px 27px'}}>{asset.mint && isValidMint(asset.mint) ? <Link className="secondary-button" href={`/public-swap?mint=${encodeURIComponent(asset.mint)}`} style={{textDecoration:'none'}} data-testid="link-explore-public-swap">Check public swap availability <ArrowRight size={14}/></Link> : <p className="muted-note">No valid Solana mint is available to pass to the public swap. Select a supported token there instead.</p>}</div>
        </>}
      </section>
    </div>
  </main><Footer/></div>;
}