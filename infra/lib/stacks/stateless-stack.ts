import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod, HttpStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  CachePolicy,
  Distribution,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  type IUserPool,
  OAuthScope,
  UserPoolClient,
  type UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { repoPath } from '../paths';

/** Vite's dev server, allowed as a sign-in callback and CORS origin in dev only. */
export const LOCAL_DEV_ORIGIN = 'http://localhost:5173';

export interface StatelessStackProps extends StackProps {
  readonly envName: string;
  readonly userPool: IUserPool;
  readonly userPoolDomain: UserPoolDomain;
  /** The built frontend (`packages/web/dist`). */
  readonly webAssetPath: string;
  /** Allow the local Vite dev server to sign in and call the API (dev only). */
  readonly allowLocalDev: boolean;
}

/**
 * Everything that can be replaced without losing data (ADR-0004): the frontend on
 * S3 + CloudFront, the HTTP API and its Lambdas, and the Cognito app client (which needs
 * the CloudFront domain for its callback URLs, so it lives here rather than with the pool).
 */
export class StatelessStack extends Stack {
  constructor(scope: Construct, id: string, props: StatelessStackProps) {
    super(scope, id, props);

    // --- Frontend: private bucket, served only through CloudFront (origin access control).
    const siteBucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Contents are rebuilt on every deploy; RETAIN avoids an extra cleanup Lambda.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const distribution = new Distribution(this, 'Site', {
      comment: `finance-app ${props.envName}`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      // Single-page app: unknown paths (e.g. a deep link) return index.html.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
    });
    const siteUrl = `https://${distribution.distributionDomainName}`;
    const allowedOrigins = props.allowLocalDev ? [siteUrl, LOCAL_DEV_ORIGIN] : [siteUrl];

    // --- Sign-in: a public client (no secret) using authorization code + PKCE.
    const webClient = new UserPoolClient(this, 'WebClient', {
      userPool: props.userPool,
      userPoolClientName: `finance-app-web-${props.envName}`,
      generateSecret: false,
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: allowedOrigins.map((origin) => `${origin}/`),
        logoutUrls: allowedOrigins.map((origin) => `${origin}/`),
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
    });

    // --- API: HTTP API with Cognito JWT validation in API Gateway, before any Lambda runs.
    const api = new HttpApi(this, 'Api', {
      apiName: `finance-app-${props.envName}`,
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: allowedOrigins,
        allowMethods: [CorsHttpMethod.ANY],
        allowHeaders: ['authorization', 'content-type', 'idempotency-key', 'if-match'],
        maxAge: Duration.hours(1),
      },
    });
    // Throttling caps the cost of abuse on a public URL.
    new HttpStage(this, 'DefaultStage', {
      httpApi: api,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 10, burstLimit: 20 },
    });

    const authorizer = new HttpUserPoolAuthorizer('CognitoAuthorizer', props.userPool, {
      userPoolClients: [webClient],
    });

    const meFunction = new NodejsFunction(this, 'MeFunction', {
      description: 'GET /me: returns the signed-in caller',
      entry: repoPath('packages/api/src/handlers/me.ts'),
      projectRoot: repoPath('.'),
      depsLockFilePath: repoPath('pnpm-lock.yaml'),
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      environment: {
        POWERTOOLS_SERVICE_NAME: 'finance-api',
        POWERTOOLS_LOG_LEVEL: 'INFO',
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: { minify: true, sourceMap: true },
      logGroup: new LogGroup(this, 'MeFunctionLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    api.addRoutes({
      path: '/me',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('MeIntegration', meFunction),
      authorizer,
    });

    // --- Upload the frontend plus a runtime config, so one build works in every environment.
    new BucketDeployment(this, 'DeploySite', {
      destinationBucket: siteBucket,
      sources: [
        Source.asset(props.webAssetPath),
        Source.jsonData('config.json', {
          region: this.region,
          userPoolId: props.userPool.userPoolId,
          clientId: webClient.userPoolClientId,
          cognitoDomain: props.userPoolDomain.baseUrl(),
          apiUrl: api.apiEndpoint,
        }),
      ],
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 256,
      logGroup: new LogGroup(this, 'DeploySiteLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    new CfnOutput(this, 'SiteUrl', { value: siteUrl });
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: props.userPool.userPoolId });
    new CfnOutput(this, 'WebClientId', { value: webClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: props.userPoolDomain.baseUrl() });
  }
}
