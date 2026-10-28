// Downloads the PostgREST release the end-to-end journey test runs against
// (docs/SPEC.md US-2.11), checks its SHA-256, and prints the binary's path.
// Test tooling only: never part of the app or the site.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VERSION = 'v12.2.12';
const SHA256 = process.env.POSTGREST_SHA256_OVERRIDE ?? '5de4092f1719da3353c40bf96c8dec6913f2254a7cd0b61cc05f233153b557d5';
const URL_ = `https://github.com/PostgREST/postgrest/releases/download/${VERSION}/postgrest-${VERSION}-linux-static-x86-64.tar.xz`;
const dir = fileURLToPath(new URL(`../.cache/postgrest-${VERSION}/`, import.meta.url));
const bin = `${dir}postgrest`;

if (!existsSync(bin)) {
  mkdirSync(dir, { recursive: true });
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`PostgREST download failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== SHA256) throw new Error(`PostgREST checksum mismatch: ${got}`);
  writeFileSync(`${dir}postgrest.tar.xz`, bytes);
  execFileSync('tar', ['xf', 'postgrest.tar.xz'], { cwd: dir });
}
readFileSync(bin);
console.log(bin);
