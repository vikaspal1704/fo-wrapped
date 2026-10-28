import type { Plugin } from 'vite';

/**
 * ADR-0001: the CSP allows exactly one extra origin, the Journal's Supabase
 * project, and only in builds given VITE_SUPABASE_URL. Without it (the GitHub
 * Pages build) connect-src stays 'self'.
 */
export function journalCsp(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'journal-csp',
    transformIndexHtml(html) {
      if (!supabaseUrl) return html;
      const origin = new URL(supabaseUrl).origin;
      if (!html.includes("connect-src 'self'")) throw new Error('CSP connect-src not found in index.html');
      return html.replace("connect-src 'self'", `connect-src 'self' ${origin}`);
    },
  };
}
