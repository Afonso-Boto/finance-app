import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A stand-in for packages/web/dist, so tests don't depend on a frontend build. */
export function fakeWebAssets(): string {
  const dir = mkdtempSync(join(tmpdir(), 'finance-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>test</title>');
  return dir;
}
