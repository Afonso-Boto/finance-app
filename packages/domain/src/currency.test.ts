import { describe, expect, it } from 'vitest';
import { isCurrencyCode } from './currency';

describe('isCurrencyCode', () => {
  it.each(['EUR', 'USD', 'GBP'])('accepts %s', (code) => {
    expect(isCurrencyCode(code)).toBe(true);
  });

  it.each(['eur', 'EU', 'EURO', '', 'E1R'])('rejects %j', (code) => {
    expect(isCurrencyCode(code)).toBe(false);
  });
});
