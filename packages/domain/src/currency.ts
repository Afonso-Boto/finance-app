/**
 * Placeholder domain function so the pipeline has real code to type-check and test.
 * Replace or extend it when the Phase 1 domain model is written.
 *
 * Checks the shape of an ISO 4217 alphabetic code (three uppercase letters).
 * It does not check that the code is a currency that actually exists.
 */
export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}
