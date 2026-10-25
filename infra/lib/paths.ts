import { fileURLToPath } from 'node:url';

/** Absolute path to a file or folder, given relative to the repository root. */
export function repoPath(relative: string): string {
  return fileURLToPath(new URL(`../../${relative}`, import.meta.url));
}
