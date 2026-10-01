import { setBaseUrl, getGetLaunchLogoUrl } from '@workspace/api-client-react';
import { formatDistanceToNowStrict } from 'date-fns';

export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');
setBaseUrl(BASE_PATH || null);

export const asset = (p: string) => `${BASE_PATH}${p}`;
export const logoSrc = (id: string) => `${BASE_PATH}${getGetLaunchLogoUrl(id)}`;

export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const HTTP_URL = /^https?:\/\/\S+$/i;
export const CSRF_HEADER = 'X-Launch-CSRF';
export const DARK_ACTIVATION_COPY = '$DARK pairing is being activated for the DarkSwap ecosystem.';

export type ApiProblem = { status: number | null; code: string | null; message: string };

export function readError(err: unknown, fallback = 'Something went wrong.'): ApiProblem {
  if (err && typeof err === 'object') {
    const e = err as { status?: unknown; data?: unknown; message?: unknown };
    const status = typeof e.status === 'number' ? e.status : null;
    const d = e.data && typeof e.data === 'object' ? (e.data as { error?: unknown; code?: unknown }) : null;
    const code = d && typeof d.code === 'string' ? d.code : null;
    const message =
      d && typeof d.error === 'string' ? d.error : typeof e.message === 'string' && e.message ? e.message : fallback;
    return { status, code, message };
  }
  return { status: null, code: null, message: fallback };
}

export const shortAddr = (a?: string | null, n = 4) => (a ? `${a.slice(0, n)}…${a.slice(-n)}` : '');

export function fmtUsd(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const abs = Math.abs(v);
  if (abs === 0) return '$0';
  if (abs < 1) return `$${v.toPrecision(3)}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: abs >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  }).format(v);
}

export function fmtNum(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return new Intl.NumberFormat('en-US', { notation: Math.abs(v) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(v);
}

export function ago(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return 'Unavailable';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unavailable' : d.toLocaleString();
}

export function fmtSupply(s: string): string {
  try {
    return BigInt(s).toLocaleString('en-US');
  } catch {
    return s || '—';
  }
}

export function statusLabel(s: string | null | undefined): string {
  if (!s) return 'Status unavailable';
  return ({ new: 'New', aboutToGraduate: 'Graduating', graduated: 'Graduated' } as Record<string, string>)[s] ?? s;
}
