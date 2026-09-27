// Runs scripts/verify-real.ts through Vite, which resolves the engine's
// TypeScript imports (including lazy ones). Usage: npm run verify:real -- --dir <dir>
import { createServer } from 'vite';

const server = await createServer({ configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false } });
try {
  const { main } = await server.ssrLoadModule(new URL('./verify-real.ts', import.meta.url).pathname);
  process.exitCode = await main(process.argv.slice(2));
} finally {
  await server.close();
}
