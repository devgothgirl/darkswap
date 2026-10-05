export const aliases: Record<string, string>;
export function isKnownRoute(pathname: string): boolean;
export function renderPageHtml(template: string, pathname: string, publicGuides?: Record<string, string>, researchHtml?: string): string;
export function applyPageMetadata(pathname: string): void;