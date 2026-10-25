import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { environments } from './config';

/**
 * The workflows repeat the account IDs from config.ts (GitHub Actions can't import it).
 * This test fails if the two drift apart, e.g. after replacing an account.
 */
const workflowsDir = new URL('../../.github/workflows/', import.meta.url);
const workflows = readdirSync(workflowsDir)
  .filter((f) => f.endsWith('.yml'))
  .map((f) => ({ name: f, text: readFileSync(new URL(f, workflowsDir), 'utf8') }));

const configured = new Set(Object.values(environments).map((e) => e.account));

describe('GitHub workflows', () => {
  it.each(workflows)('$name only uses account IDs from config.ts', ({ text }) => {
    const used = [...text.matchAll(/\b\d{12}\b/g)].map((m) => m[0]);
    for (const account of used) {
      expect(configured).toContain(account);
    }
  });

  it('deploy.yml deploys every environment to its own account', () => {
    const deploy = workflows.find((w) => w.name === 'deploy.yml')?.text ?? '';
    for (const env of Object.values(environments)) {
      expect(deploy).toContain(`arn:aws:iam::${env.account}:role/finance-app-github-deploy`);
      expect(deploy).toContain(`cdk deploy "*-${env.name}"`);
      expect(deploy).toContain(`aws-region: ${env.region}`);
    }
  });
});
