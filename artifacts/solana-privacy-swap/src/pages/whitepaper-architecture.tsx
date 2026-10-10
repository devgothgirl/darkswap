const wallet = 'You and your wallet';
const terminal = 'DarkSwap terminal (darkswap.app): quotes, order review, deposit instructions, tracking';
const lanes = [
  {
    status: 'live',
    text: 'Privacy swap. NEAR Intents 1Click, basic confidential handling. From Solana to Solana, NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon or BNB Chain.',
    operator: 'NEAR Intents.',
  },
  {
    status: 'live',
    text: 'Sponsored privacy swap by Houdini. Destinations as quoted.',
    operator: 'Houdini.',
  },
  {
    status: 'scheduled',
    text: "Dark pool on NEAR. Confidential balance on NEAR's private shard. Deposit from and withdraw to supported chains.",
    operator: 'NEAR Intents.',
  },
  {
    status: 'built',
    text: 'DarkSwap ZK pools. One Solana program, one contract for Ethereum and Base. Not deployed.',
    operator: 'DarkSwap (relayer, indexer, admin key).',
  },
] as const;

const alternative = [
  wallet,
  terminal,
  ...lanes.map(lane => `${lane.status}: ${lane.text} Run by: ${lane.operator}`),
].join('\n');

export default function WhitepaperArchitecture() {
  return <figure className="wp-architecture">
    <div role="img" aria-label={alternative}>
      <div className="wp-architecture-visual" aria-hidden="true">
        <div className="wp-architecture-node wp-architecture-wallet">{wallet}</div>
        <div className="wp-architecture-connector" />
        <div className="wp-architecture-node wp-architecture-terminal">{terminal}</div>
        <div className="wp-architecture-connector" />
        <div className="wp-architecture-lanes">
          {lanes.map(lane => <div className="wp-architecture-lane" key={lane.text}>
            <div className="wp-architecture-branch" />
            <div className="wp-architecture-node">
              <span className={`wp-tag wp-tag-${lane.status}`}>{lane.status}</span>
              <p>{lane.text}</p>
              <p className="wp-architecture-operator">Run by: {lane.operator}</p>
            </div>
          </div>)}
        </div>
      </div>
    </div>
    <figcaption>The NEAR dark pool and the ZK pools are separate tiers. Nothing moves between them.</figcaption>
  </figure>;
}
