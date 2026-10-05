/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#ffffff",
      "foreground": "#140e22",
      "border": "#e4ddf3",
      "card": "#ffffff",
      "cardForeground": "#140e22",
      "popover": "#ffffff",
      "popoverForeground": "#140e22",
      "primary": "#6a2ff0",
      "primaryForeground": "#ffffff",
      "secondary": "#f3eefe",
      "secondaryForeground": "#3a1e76",
      "muted": "#f5f3fa",
      "mutedForeground": "#645a7d",
      "accent": "#ece3fe",
      "accentForeground": "#4a23a5",
      "destructive": "#d12229",
      "destructiveForeground": "#ffffff",
      "input": "#d8cfee",
      "ring": "#6a2ff0",
      "chart1": "#6a2ff0",
      "chart2": "#9769f4",
      "chart3": "#4522a8",
      "chart4": "#c23ad1",
      "chart5": "#3765e0",
      "sidebar": "#faf8ff",
      "sidebarForeground": "#3a3450",
      "sidebarBorder": "#e4ddf3",
      "sidebarPrimary": "#6a2ff0",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#ece3fe",
      "sidebarAccentForeground": "#4a23a5",
      "sidebarRing": "#6a2ff0"
    },
    "dark": {
      "background": "#07060b",
      "foreground": "#f5f2ea",
      "border": "#221d31",
      "card": "#100e18",
      "cardForeground": "#f5f2ea",
      "popover": "#161322",
      "popoverForeground": "#f5f2ea",
      "primary": "#8b50e8",
      "primaryForeground": "#ffffff",
      "secondary": "#1e1733",
      "secondaryForeground": "#cdb4ff",
      "muted": "#141120",
      "mutedForeground": "#a39cb8",
      "accent": "#2a1f4a",
      "accentForeground": "#cdb4ff",
      "destructive": "#f05a5f",
      "destructiveForeground": "#1a0b0d",
      "input": "#312a45",
      "ring": "#a376f2",
      "chart1": "#8b50e8",
      "chart2": "#cdb4ff",
      "chart3": "#5a35a6",
      "chart4": "#e05ad8",
      "chart5": "#5b8ff9",
      "sidebar": "#0b0a11",
      "sidebarForeground": "#cfc8be",
      "sidebarBorder": "#221d31",
      "sidebarPrimary": "#8b50e8",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#1e1733",
      "sidebarAccentForeground": "#cdb4ff",
      "sidebarRing": "#a376f2"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "system-ui",
      "sans-serif"
    ],
    "serif": [
      "Source Serif 4",
      "Georgia",
      "serif"
    ],
    "mono": [
      "JetBrains Mono",
      "ui-monospace",
      "monospace"
    ]
  },
  "radius": "0.75rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
