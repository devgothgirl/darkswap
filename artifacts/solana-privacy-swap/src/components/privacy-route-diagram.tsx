import './privacy-route-diagram.css';

const assetBase = `${import.meta.env.BASE_URL}docs/privacy-route-flow`;

export function PrivacyRouteDiagram() {
  return (
    <figure className="privacy-route-diagram" aria-label="Privacy route transaction diagram">
      <picture>
        <source media="(max-width: 767px)" srcSet={`${assetBase}-mobile.svg`} width={620} height={1250} />
        <img
          src={`${assetBase}.svg`}
          width={1440}
          height={760}
          loading="lazy"
          alt="Review a live quote and create an order. Manually deposit from your Solana wallet to Privacy Routers, which execute the selected route. Successful settlement delivers the quoted asset to your receiving wallet. Track your order until completion."
        />
      </picture>
      <figcaption>
        <span>Route overview—not a guarantee of execution or anonymity. Follow your active quote and order instructions.</span>
        <div className="privacy-route-diagram-downloads">
          <a href={`${assetBase}.png`} download="darkswap-privacy-route.png">Download PNG</a>
          <a href={`${assetBase}.svg`} download="darkswap-privacy-route.svg">Download SVG</a>
        </div>
      </figcaption>
    </figure>
  );
}