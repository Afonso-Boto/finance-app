/** Values written to /config.json by the Stateless stack at deploy time. */
export interface AppConfig {
  readonly region: string;
  readonly userPoolId: string;
  readonly clientId: string;
  /** Hosted sign-in base URL, e.g. https://finance-app-dev-123.auth.eu-north-1.amazoncognito.com */
  readonly cognitoDomain: string;
  readonly apiUrl: string;
}

const KEYS = ['region', 'userPoolId', 'clientId', 'cognitoDomain', 'apiUrl'] as const;

export function parseConfig(value: unknown): AppConfig {
  if (typeof value !== 'object' || value === null) {
    throw new Error('config.json is not an object');
  }
  const record = value as Record<string, unknown>;
  for (const key of KEYS) {
    if (typeof record[key] !== 'string' || record[key] === '') {
      throw new Error(`config.json is missing "${key}"`);
    }
  }
  return record as unknown as AppConfig;
}

export async function loadConfig(): Promise<AppConfig> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load /config.json (${response.status})`);
  }
  return parseConfig(await response.json());
}
