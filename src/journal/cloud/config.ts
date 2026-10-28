/**
 * Cloud settings for the Journal (ADR-0001). Absent in the GitHub Pages build:
 * then the Journal is local only and makes no network calls at all.
 */
export interface CloudConfig {
  url: string;
  anonKey: string;
  fetch: typeof fetch;
}

export function cloudConfig(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ''), anonKey, fetch: (...args) => globalThis.fetch(...args) };
}

/** Display prices are owner decisions (BRIEF §9); they come from the build, never from code. */
export function planPrices(): { monthly: string | null; annual: string | null } {
  return {
    monthly: (import.meta.env.VITE_JOURNAL_PRICE_MONTHLY as string | undefined) ?? null,
    annual: (import.meta.env.VITE_JOURNAL_PRICE_ANNUAL as string | undefined) ?? null,
  };
}
