type EventName = "swap_entry_clicked" | "terminal_opened" | "loyalty_details_clicked" | "token_mechanics_opened" | "docs_opened" | "previews_opened" | "faq_opened" | "rewards_page_opened" | "docs_topic_opened" | "preview_opened";
type EventData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track(name: string, data?: EventData): void | Promise<unknown> };
  }
}

export function trackEvent(name: EventName, data?: EventData): void {
  if (typeof window === "undefined") return;
  try {
    const result = window.umami?.track(name, data);
    if (result) void Promise.resolve(result).catch(() => {});
  } catch {
    // Analytics must never interrupt navigation or financial operations.
  }
}

// Only static public destinations are allowed; never pass URLs, user inputs,
// addresses, order identifiers, amounts or authentication data as properties.
export function trackLandingClick(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const link = target.closest("a");
  if (!link) return;
  const href = link.getAttribute("href");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const location = link.closest(".launch-header") ? "header"
    : link.closest(".launch-hero") ? "hero"
    : link.closest(".scope-section") ? "product_cards"
    : link.closest(".loyalty-section") ? "loyalty_section"
    : link.classList.contains("closing-button") ? "closing_cta" : "landing_other";
  if (href === `${base}/near-swap` || href === `${base}/swap`) {
    trackEvent("swap_entry_clicked", { location, route: href === `${base}/swap` ? "private_route" : "privacy_swap" });
  } else if (href === "https://darkswap.world/") {
    trackEvent("terminal_opened", { location });
  } else if (href === "#loyalty-rewards") {
    trackEvent("loyalty_details_clicked", { location });
  } else if (href === "https://stonkfun.xyz") {
    trackEvent("token_mechanics_opened", { location });
  } else if (href === `${base}/docs`) {
    trackEvent("docs_opened", { location });
  } else if (href === `${base}/previews`) {
    trackEvent("previews_opened", { location });
  } else if (href === `${base}/rewards`) {
    trackEvent("rewards_page_opened", { location });
  }
}