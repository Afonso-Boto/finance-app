import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BootstrapStack, DEPLOY_ROLE_NAME, DIFF_ROLE_NAME } from './bootstrap-stack';

function synth(trustedSubject = 'ref:refs/heads/main'): Template {
  const stack = new BootstrapStack(new App(), 'Bootstrap-test', {
    env: { account: '111111111111', region: 'eu-north-1' },
    envName: 'test',
    github: { owner: 'owner', repo: 'repo' },
    trustedSubject,
  });
  return Template.fromStack(stack);
}

function trustFor(subject: string) {
  return {
    Statement: [
      Match.objectLike({
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': subject,
          },
        },
      }),
    ],
  };
}

/** The single policy statement attached to the role with this name. */
function permissionsOf(template: Template, roleName: string) {
  const roles = template.findResources('AWS::IAM::Role', { Properties: { RoleName: roleName } });
  const [logicalId] = Object.keys(roles);
  const policies = Object.values(template.findResources('AWS::IAM::Policy')).filter((p) =>
    (p.Properties.Roles as { Ref: string }[]).some((r) => r.Ref === logicalId),
  );
  return policies.flatMap((p) => p.Properties.PolicyDocument.Statement);
}

/** IAM-style wildcard match, to check the role patterns against real bootstrap role names. */
function matches(pattern: string, name: string): boolean {
  const regex = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${regex}$`).test(name);
}

const arn = (rolePattern: string) => ({
  'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, `:iam::111111111111:role/${rolePattern}`]],
});

describe('BootstrapStack', () => {
  it('registers GitHub as an OIDC provider for STS', () => {
    synth().hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
  });

  it.each([
    ['ref:refs/heads/main', 'repo:owner/repo:ref:refs/heads/main'],
    ['environment:prod', 'repo:owner/repo:environment:prod'],
  ])('deploy role trusts exactly one subject (%s)', (trustedSubject, expectedSub) => {
    synth(trustedSubject).hasResourceProperties('AWS::IAM::Role', {
      RoleName: DEPLOY_ROLE_NAME,
      MaxSessionDuration: 3600,
      AssumeRolePolicyDocument: trustFor(expectedSub),
    });
  });

  it('deploy role can only assume the CDK bootstrap roles', () => {
    expect(permissionsOf(synth(), DEPLOY_ROLE_NAME)).toEqual([
      { Action: 'sts:AssumeRole', Effect: 'Allow', Resource: arn('cdk-hnb659fds-*') },
    ]);
  });

  it('diff role trusts only pull request workflows of this repository', () => {
    synth().hasResourceProperties('AWS::IAM::Role', {
      RoleName: DIFF_ROLE_NAME,
      MaxSessionDuration: 3600,
      AssumeRolePolicyDocument: trustFor('repo:owner/repo:pull_request'),
    });
  });

  it('diff role can only assume the read-only CDK lookup role', () => {
    // The lookup role is named cdk-hnb659fds-lookup-role-<account>-<region>.
    expect(matches('cdk-hnb659fds-*', 'cdk-hnb659fds-lookup-role-111111111111-eu-north-1')).toBe(
      true,
    );
    expect(
      matches('cdk-hnb659fds-lookup-role-*', 'cdk-hnb659fds-deploy-role-111111111111-eu-north-1'),
    ).toBe(false);
    expect(
      matches('cdk-hnb659fds-lookup-role-*', 'cdk-hnb659fds-lookup-role-111111111111-eu-north-1'),
    ).toBe(true);

    expect(permissionsOf(synth(), DIFF_ROLE_NAME)).toEqual([
      {
        Action: 'sts:AssumeRole',
        Effect: 'Allow',
        Resource: arn('cdk-hnb659fds-lookup-role-*'),
      },
    ]);
  });

  it('attaches no managed policies to either role', () => {
    const roles = Object.values(synth().findResources('AWS::IAM::Role'));
    expect(roles).toHaveLength(2);
    for (const role of roles) {
      expect(role.Properties.ManagedPolicyArns).toBeUndefined();
    }
  });
});
