import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import {
  OidcProviderNative,
  OpenIdConnectPrincipal,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';

/** The default qualifier `cdk bootstrap` uses for its roles (cdk-hnb659fds-deploy-role-…). */
const CDK_BOOTSTRAP_QUALIFIER = 'hnb659fds';

/** Fixed so workflows can build the ARN from the account ID alone. */
export const DEPLOY_ROLE_NAME = 'finance-app-github-deploy';

export interface BootstrapStackProps extends StackProps {
  readonly envName: string;
  readonly github: { readonly owner: string; readonly repo: string };
  /** The part of GitHub's OIDC `sub` claim after `repo:<owner>/<repo>:`, e.g. `environment:prod`. */
  readonly trustedSubject: string;
}

/**
 * Lets GitHub Actions deploy to this account without long-lived keys (ADR-0004).
 *
 * - An IAM OIDC identity provider for GitHub's token issuer.
 * - One deploy role that only this repository, in one exact context, can assume.
 * - The role can do nothing except assume the CDK bootstrap roles. Those roles
 *   (created by `cdk bootstrap`) hold the actual deploy permissions, so this role
 *   never needs broad IAM rights itself.
 *
 * Deployed once per account from a laptop with an admin profile, never by the pipeline:
 * the pipeline cannot create the role it needs in order to run.
 */
export class BootstrapStack extends Stack {
  readonly deployRole: Role;

  constructor(scope: Construct, id: string, props: BootstrapStackProps) {
    super(scope, id, props);

    // No thumbprints: IAM verifies GitHub's certificate against its own trusted CAs.
    const provider = new OidcProviderNative(this, 'GitHubOidcProvider', {
      url: `https://${GITHUB_OIDC_HOST}`,
      clientIds: ['sts.amazonaws.com'],
    });

    const subject = `repo:${props.github.owner}/${props.github.repo}:${props.trustedSubject}`;

    this.deployRole = new Role(this, 'GitHubDeployRole', {
      roleName: DEPLOY_ROLE_NAME,
      description: `GitHub Actions deploy role for ${props.envName}; trusts only ${subject}`,
      assumedBy: new OpenIdConnectPrincipal(provider, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_OIDC_HOST}:sub`]: subject,
        },
      }),
      maxSessionDuration: Duration.hours(1),
    });

    this.deployRole.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${this.partition}:iam::${this.account}:role/cdk-${CDK_BOOTSTRAP_QUALIFIER}-*`,
        ],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description: 'Use as role-to-assume in aws-actions/configure-aws-credentials',
    });
  }
}
