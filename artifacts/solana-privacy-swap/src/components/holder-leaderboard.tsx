import { useMemo } from 'react';
import { rankHolders, type WalletBalance } from '../lib/holder-ranking';

export type LeaderboardSource =
  | { status: 'unavailable'; reason: string }
  | { status: 'ready'; symbol: string; balances: readonly WalletBalance[] };

function shortWallet(w: string) { return w.length > 14 ? `${w.slice(0, 6)}...${w.slice(-6)}` : w; }

export function HolderLeaderboard({ source }: { source: LeaderboardSource }) {
  const result = useMemo(() => {
    if (source.status !== 'ready') return null;
    try { return { rows: rankHolders(source.balances), error: '' }; }
    catch (e) { return { rows: [], error: e instanceof Error ? e.message : 'Balances could not be ranked.' }; }
  }, [source]);

  if (source.status === 'unavailable') {
    return <div className="tk-board tk-board-empty" role="status" data-testid="status-leaderboard-unavailable">
      <span className="tk-pill">Unavailable / prelaunch</span>
      <h2>No holder rankings yet.</h2>
      <p>{source.reason}</p>
    </div>;
  }
  if (result?.error) return <div className="tk-board tk-board-empty" role="alert" data-testid="status-leaderboard-error"><h2>Rankings unavailable.</h2><p>{result.error}</p></div>;
  if (!result?.rows.length) return <div className="tk-board tk-board-empty" role="status" data-testid="status-leaderboard-empty"><h2>No balances supplied.</h2></div>;

  return <div className="tk-board">
    <table className="tk-table" data-testid="table-leaderboard">
      <thead><tr><th scope="col">Rank</th><th scope="col">Wallet</th><th scope="col" className="tk-num">{source.symbol} held</th></tr></thead>
      <tbody>{result.rows.map(r => <tr key={r.wallet} data-testid={`row-holder-${r.wallet}`}>
        <td>{r.rank}</td><td title={r.wallet} className="tk-mono">{shortWallet(r.wallet)}</td><td className="tk-num tk-mono">{r.display}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
