import { describe, expect, it } from 'vitest';
import { requireCurrencyCode } from './validation';

describe('requireCurrencyCode', () => {
  it('returns a valid code', () => {
    expect(requireCurrencyCode('EUR')).toBe('EUR');
  });

  it.each([undefined, 42, 'eur'])('throws for %j', (value) => {
    expect(() => requireCurrencyCode(value)).toThrow('Invalid currency code');
  });
});
