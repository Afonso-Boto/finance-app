import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

const valid = {
  region: 'eu-north-1',
  userPoolId: 'eu-north-1_abc',
  clientId: 'client',
  cognitoDomain: 'https://example.auth.eu-north-1.amazoncognito.com',
  apiUrl: 'https://api.example.com',
};

describe('parseConfig', () => {
  it('accepts a complete config', () => {
    expect(parseConfig(valid)).toEqual(valid);
  });

  it.each(Object.keys(valid))('rejects a config without %s', (key) => {
    const { [key as keyof typeof valid]: _removed, ...rest } = valid;
    expect(() => parseConfig(rest)).toThrow(`missing "${key}"`);
  });
});
