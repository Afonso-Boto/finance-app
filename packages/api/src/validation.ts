import { isCurrencyCode } from '@finance/domain';

/**
 * Placeholder that proves `api` can import `domain` through the workspace.
 * Real request validation is generated from the OpenAPI spec (ADR-0003).
 */
export function requireCurrencyCode(value: unknown): string {
  if (typeof value !== 'string' || !isCurrencyCode(value)) {
    throw new Error(`Invalid currency code: ${String(value)}`);
  }
  return value;
}
