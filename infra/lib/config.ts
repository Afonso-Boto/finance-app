/**
 * Per-environment settings. This is the only place account IDs, Regions and
 * limits live; stacks receive these values as props and never read them directly.
 */
export type EnvName = 'dev' | 'prod';

export interface EnvironmentConfig {
  readonly name: EnvName;
  readonly account: string;
  readonly region: string;
  readonly budget: {
    /** Monthly cost limit for this account, in USD, before credits. */
    readonly monthlyLimitUsd: number;
  };
}

/** Workload Region for every environment (ADR-0004). */
const REGION = 'eu-north-1';

export const environments: Record<EnvName, EnvironmentConfig> = {
  dev: {
    name: 'dev',
    account: '117442930591',
    region: REGION,
    budget: { monthlyLimitUsd: 5 },
  },
  prod: {
    name: 'prod',
    account: '756429941457',
    region: REGION,
    budget: { monthlyLimitUsd: 5 },
  },
};

/**
 * Budget alert recipient, read from the environment so a personal email
 * address is not committed to the repository.
 */
export function budgetAlertEmail(): string {
  const email = process.env.BUDGET_ALERT_EMAIL;
  if (!email) {
    throw new Error('Set BUDGET_ALERT_EMAIL to the address that should receive budget alerts.');
  }
  return email;
}
