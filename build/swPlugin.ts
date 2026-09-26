import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Emits sw.js with the exact list of built files to precache (ROADMAP X3).
 * The version is a hash of that list, so every deploy with changed assets
 * installs a fresh cache and deletes the old one.
 */
export function serviceWorker(publicFiles: string[]): Plugin {
  return {
    name: 'fo-wrapped-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', './index.html', ...Object.keys(bundle).map((f) => `./${f}`), ...publicFiles.map((f) => `./${f}`)]
        .filter((f) => !f.endsWith('.map'))
        .sort();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files, null, 2)),
      });
    },
  };
}
