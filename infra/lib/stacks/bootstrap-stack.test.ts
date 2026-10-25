import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BootstrapStack, DEPLOY_ROLE_NAME } from './bootstrap-stack';

function synth(trustedSubject: string): Template {
  const stack = new BootstrapStack(new App(), 'Bootstrap-test', {
    env: { account: '111111111111', region: 'eu-north-1' },
    envName: 'test',
    github: { owner: 'owner', repo: 'repo' },
    trustedSubject,
  });
  return Template.fromStack(stack);
}

describe('BootstrapStack', () => {
  it('registers GitHub as an OIDC provider for STS', () => {
    synth('ref:refs/heads/main').hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
  });

  it.each([
    ['ref:refs/heads/main', 'repo:owner/repo:ref:refs/heads/main'],
    ['environment:prod', 'repo:owner/repo:environment:prod'],
  ])('trusts exactly one subject (%s)', (trustedSubject, expectedSub) => {
    synth(trustedSubject).hasResourceProperties('AWS::IAM::Role', {
      RoleName: DEPLOY_ROLE_NAME,
      MaxSessionDuration: 3600,
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': expectedSub,
              },
            },
          }),
        ],
      },
    });
  });

  it('can only assume the CDK bootstrap roles', () => {
    const policies = synth('ref:refs/heads/main').findResources('AWS::IAM::Policy');
    const statements = Object.values(policies).flatMap(
      (p) => p.Properties.PolicyDocument.Statement as { Action: unknown; Resource: unknown }[],
    );
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      Action: 'sts:AssumeRole',
      Resource: {
        'Fn::Join': [
          '',
          ['arn:', { Ref: 'AWS::Partition' }, ':iam::111111111111:role/cdk-hnb659fds-*'],
        ],
      },
    });
  });

  it('attaches no managed policies to the deploy role', () => {
    synth('ref:refs/heads/main').hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.absent(),
    });
  });
});
