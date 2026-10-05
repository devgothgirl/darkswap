import { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'wouter';
import config from '../seo-config.json';

export type PageMeta = { title?: string; description: string; noindex?: boolean };
export const MetaContext = createContext<{ current?: PageMeta } | null>(null);
export const pageUrl = (route: string) => `${config.origin}${config.basePath}${route.replace(/^\//, '').split('?')[0]}`;
export const socialImage = pageUrl('/hero-monolith.jpg');

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

export function usePageMeta({ title, description, noindex = false }: PageMeta) {
  const collector = useContext(MetaContext);
  const [location] = useLocation();
  if (collector) collector.current = { title, description, noindex };
  useEffect(() => {
    const full = title ? `${title} | DarkSwap Launch` : 'DarkSwap Launch — launch in the dark.';
    document.title = full;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
    setMeta('name', 'twitter:title', full);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    const url = pageUrl(location);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:image', socialImage);
    setMeta('name', 'twitter:url', url);
    setMeta('name', 'twitter:image', socialImage);
  }, [title, description, noindex, location]);
}
