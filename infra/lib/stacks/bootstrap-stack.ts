import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import {
  type IOidcProvider,
  OidcProviderNative,
  OpenIdConnectPrincipal,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';

/** The default qualifier `cdk bootstrap` uses for its roles (cdk-hnb659fds-deploy-role-…). */
const CDK_BOOTSTRAP_QUALIFIER = 'hnb659fds';

/** Fixed names so workflows can build the ARNs from the account ID alone. */
export const DEPLOY_ROLE_NAME = 'finance-app-github-deploy';
export const DIFF_ROLE_NAME = 'finance-app-github-diff';

/** The `sub` claim suffix GitHub issues to workflows triggered by a pull request. */
const PULL_REQUEST_SUBJECT = 'pull_request';

export interface BootstrapStackProps extends StackProps {
  readonly envName: string;
  readonly github: { readonly owner: string; readonly repo: string };
  /** The part of GitHub's OIDC `sub` claim after `repo:<owner>/<repo>:`, e.g. `environment:prod`. */
  readonly trustedSubject: string;
}

/**
 * Lets GitHub Actions reach this account without long-lived keys (ADR-0004).
 *
 * - An IAM OIDC identity provider for GitHub's token issuer.
 * - A deploy role that only this repository, in one exact context, can assume. It can do
 *   nothing except assume the CDK bootstrap roles, which hold the actual deploy permissions.
 * - A diff role for pull requests. It can only assume the CDK lookup role, which is
 *   read-only, so a pull request can show `cdk diff` but never change anything.
 *
 * Deployed once per account from a laptop with an admin profile, never by the pipeline:
 * the pipeline cannot create, or be trusted to change, the roles it runs as.
 */
export class BootstrapStack extends Stack {
  readonly deployRole: Role;
  readonly diffRole: Role;

  constructor(scope: Construct, id: string, props: BootstrapStackProps) {
    super(scope, id, props);

    // No thumbprints: IAM verifies GitHub's certificate against its own trusted CAs.
    const provider = new OidcProviderNative(this, 'GitHubOidcProvider', {
      url: `https://${GITHUB_OIDC_HOST}`,
      clientIds: ['sts.amazonaws.com'],
    });

    const repo = `repo:${props.github.owner}/${props.github.repo}`;

    this.deployRole = this.githubRole('GitHubDeployRole', {
      provider,
      roleName: DEPLOY_ROLE_NAME,
      subject: `${repo}:${props.trustedSubject}`,
      assumableRoles: '*',
      purpose: `deploy role for ${props.envName}`,
    });

    this.diffRole = this.githubRole('GitHubDiffRole', {
      provider,
      roleName: DIFF_ROLE_NAME,
      subject: `${repo}:${PULL_REQUEST_SUBJECT}`,
      assumableRoles: 'lookup-role-*',
      purpose: `read-only diff role for ${props.envName} pull requests`,
    });

    new CfnOutput(this, 'DeployRoleArn', { value: this.deployRole.roleArn });
    new CfnOutput(this, 'DiffRoleArn', { value: this.diffRole.roleArn });
  }

  private githubRole(
    id: string,
    options: {
      provider: IOidcProvider;
      roleName: string;
      subject: string;
      /** Which CDK bootstrap roles it may assume: the name after `cdk-<qualifier>-`. */
      assumableRoles: string;
      purpose: string;
    },
  ): Role {
    const role = new Role(this, id, {
      roleName: options.roleName,
      description: `GitHub Actions ${options.purpose}; trusts only ${options.subject}`,
      assumedBy: new OpenIdConnectPrincipal(options.provider, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_OIDC_HOST}:sub`]: options.subject,
        },
      }),
      maxSessionDuration: Duration.hours(1),
    });

    const pattern = `cdk-${CDK_BOOTSTRAP_QUALIFIER}-${options.assumableRoles}`;
    role.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:${this.partition}:iam::${this.account}:role/${pattern}`],
      }),
    );
    return role;
  }
}
