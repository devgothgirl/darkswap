type EventName = "swap_entry_clicked" | "terminal_opened" | "loyalty_details_clicked" | "token_mechanics_opened" | "docs_opened" | "previews_opened" | "faq_opened" | "rewards_page_opened" | "docs_topic_opened" | "preview_opened"
  | "swap_route_tab_clicked" | "swap_review_opened" | "swap_quote_refreshed" | "swap_quote_requested"
  | "swap_order_created" | "swap_order_failed" | "order_detail_copied"
  | "announcement_viewed" | "announcement_action" | "token_address_copied"
  | "whitepaper_opened" | "whitepaper_section_opened" | "whitepaper_print_opened"
  | "help_answer_opened" | "support_request_sent"
  | "order_status_viewed" | "order_shared" | "rewards_console_opened" | "near_intents_opened"
  | "updates_signup_completed" | "rewards_account_viewed" | "rewards_enrollment_step"
  | "pool_preview_opened" | "help_opened" | "order_lookup_opened" | "mobile_navigation_opened";
export type SwapRoute = "private_route" | "privacy_swap" | "bridge";
type EventData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track(name: string, data?: EventData): void | Promise<unknown> };
  }
}

export function trackEvent(name: EventName, data?: EventData): void {
  if (typeof window === "undefined") return;
  // Never associate custom events with private order tracking or recovery.
  const path = window.location?.pathname ?? '';
  if (/(?:^|\/)near-order(?:\/|$)/.test(path)) return;
  try {
    const result = window.umami?.track(name, data);
    if (result) void Promise.resolve(result).catch(() => {});
  } catch {
    // Analytics must never interrupt navigation or financial operations.
  }
}

// A closed destination list keeps navigation events free of URLs and user data.
export function trackPublicNavigation(
  destination: "swap" | "privacy_swap" | "bridge" | "rewards_console" | "pool" | "docs" | "account_points" | "founder" | "help" | "near_intents",
  location: "header" | "footer",
): void {
  switch (destination) {
    case "swap": trackEvent("swap_entry_clicked", { location, route: "private_route" }); break;
    case "privacy_swap": trackEvent("swap_entry_clicked", { location, route: "privacy_swap" }); break;
    case "bridge": trackEvent("swap_entry_clicked", { location, route: "bridge" }); break;
    case "rewards_console": trackEvent("rewards_console_opened", { location }); break;
    case "pool": trackEvent("pool_preview_opened", { location }); break;
    case "docs": trackEvent("docs_opened", { location }); break;
    case "account_points": trackEvent("rewards_page_opened", { location }); break;
    case "founder": trackEvent("preview_opened", { location, feature: "founder" }); break;
    case "help": trackEvent("help_opened", { location }); break;
    case "near_intents": trackEvent("near_intents_opened", { location }); break;
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
  } else if (href === "https://rewards.darkswap.app") {
    trackEvent("rewards_console_opened", { location });
  } else if (href === "https://near-intents.org/") {
    trackEvent("near_intents_opened", { location });
  }
}