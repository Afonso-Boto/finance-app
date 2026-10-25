import { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import middy from '@middy/core';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';

const logger = new Logger();
const tracer = new Tracer();

export interface MeResponse {
  /** Cognito user ID; stable for the life of the user. */
  readonly sub: string;
  readonly username: string;
  readonly scopes: readonly string[];
}

type Claims = Record<string, string | number | boolean | string[]>;

/**
 * Who the caller is, taken from the access token claims that API Gateway already
 * validated. The handler never parses or trusts the token itself.
 */
export function toMe(claims: Claims): MeResponse {
  const sub = claims.sub;
  if (typeof sub !== 'string' || sub === '') {
    throw new Error('Access token has no sub claim');
  }
  const username = typeof claims.username === 'string' ? claims.username : sub;
  const scope = typeof claims.scope === 'string' ? claims.scope : '';
  return { sub, username, scopes: scope.split(' ').filter(Boolean) };
}

async function me(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  // The request ID ties these logs to API Gateway's access logs and the X-Ray trace.
  logger.appendKeys({ correlationId: event.requestContext.requestId });

  const body = toMe(event.requestContext.authorizer.jwt.claims);
  logger.info('Resolved caller', { sub: body.sub });

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** GET /me — behind the Cognito JWT authorizer (Stateless stack). */
export const handler = middy(me)
  .use(captureLambdaHandler(tracer))
  .use(injectLambdaContext(logger, { resetKeys: true }));
