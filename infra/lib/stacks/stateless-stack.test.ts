import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { fakeWebAssets } from '../test-support';
import { StatefulStack } from './stateful-stack';
import { LOCAL_DEV_ORIGIN, StatelessStack } from './stateless-stack';

const env = { account: '111111111111', region: 'eu-north-1' };
const webAssetPath = fakeWebAssets();

function synth(allowLocalDev: boolean): Template {
  const app = new App();
  const stateful = new StatefulStack(app, 'Stateful-test', { env, envName: 'test' });
  const stack = new StatelessStack(app, 'Stateless-test', {
    env,
    envName: 'test',
    userPool: stateful.userPool,
    userPoolDomain: stateful.userPoolDomain,
    webAssetPath,
    allowLocalDev,
  });
  return Template.fromStack(stack);
}

// Bundling the Lambda with esbuild makes synth slow; reuse the two templates.
const dev = synth(true);
const prod = synth(false);

describe('StatelessStack', () => {
  it('keeps the site bucket private and serves it only through CloudFront', () => {
    dev.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    dev.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('serves index.html for unknown paths, so deep links work', () => {
    dev.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        CustomErrorResponses: [
          Match.objectLike({ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' }),
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
        ],
      }),
    });
  });

  it('protects GET /me with the Cognito JWT authorizer', () => {
    const [authorizerId] = Object.keys(dev.findResources('AWS::ApiGatewayV2::Authorizer'));
    dev.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', { AuthorizerType: 'JWT' });
    dev.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /me',
      AuthorizationType: 'JWT',
      AuthorizerId: { Ref: authorizerId },
    });
  });

  it('throttles the API stage', () => {
    dev.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
    });
  });

  it('runs the /me Lambda on Node 24, arm64, with tracing', () => {
    dev.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      TracingConfig: { Mode: 'Active' },
      Handler: 'index.handler',
    });
  });

  it('uses a public app client with authorization code flow only', () => {
    dev.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
    });
  });

  it('allows the local dev server only in dev', () => {
    const callbackUrls = (template: Template) => {
      const [client] = Object.values(template.findResources('AWS::Cognito::UserPoolClient'));
      return JSON.stringify(client?.Properties.CallbackURLs);
    };
    expect(callbackUrls(dev)).toContain(`${LOCAL_DEV_ORIGIN}/`);
    expect(callbackUrls(prod)).not.toContain('localhost');

    const corsOrigins = (template: Template) => {
      const [api] = Object.values(template.findResources('AWS::ApiGatewayV2::Api'));
      return JSON.stringify(api?.Properties.CorsConfiguration.AllowOrigins);
    };
    expect(corsOrigins(dev)).toContain(LOCAL_DEV_ORIGIN);
    expect(corsOrigins(prod)).not.toContain('localhost');
  });
});
