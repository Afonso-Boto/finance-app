import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler, toMe } from './me';

describe('toMe', () => {
  it('returns sub, username and scopes from the access token claims', () => {
    expect(toMe({ sub: 'abc-123', username: 'afonso', scope: 'openid email profile' })).toEqual({
      sub: 'abc-123',
      username: 'afonso',
      scopes: ['openid', 'email', 'profile'],
    });
  });

  it('falls back to sub when there is no username claim', () => {
    expect(toMe({ sub: 'abc-123' })).toEqual({ sub: 'abc-123', username: 'abc-123', scopes: [] });
  });

  it('rejects claims without a sub', () => {
    expect(() => toMe({ username: 'afonso' })).toThrow('no sub claim');
  });
});

describe('handler', () => {
  it('responds with the caller as JSON', async () => {
    const event = {
      requestContext: {
        requestId: 'req-1',
        authorizer: { jwt: { claims: { sub: 'abc-123', username: 'afonso' }, scopes: [] } },
      },
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
    const context = { functionName: 'me', awsRequestId: 'aws-req-1' } as Context;

    const result = await handler(event, context);

    expect(result).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sub: 'abc-123', username: 'afonso', scopes: [] }),
    });
  });
});
