import type { AnchorHTMLAttributes } from "react";

// Real route labels/copy stay intact; their destinations are local sections only.
const destinations: Record<string, string> = {
  "/": "#top",
  "/swap": "#scope",
  "/near-swap": "#scope",
  "/tokenomics": "#loyalty-rewards",
  "/docs": "#questions",
  "/founder": "#scope",
  "/rewards": "#loyalty-rewards",
};

export function Link({
  href = "#top",
  onClick,
  onAuxClick,
  target: _target,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const anchor = href.startsWith("#") ? href : destinations[href] ?? "#scope";

  return (
    <a
      {...props}
      href={anchor}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
        const section = document.getElementById(anchor.slice(1));
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        section?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }}
      onAuxClick={(event) => {
        event.preventDefault();
        onAuxClick?.(event);
      }}
    />
  );
}