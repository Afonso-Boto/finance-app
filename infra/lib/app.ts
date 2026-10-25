import { type App, Tags } from 'aws-cdk-lib';
import { type EnvironmentConfig, github } from './config';
import { BootstrapStack } from './stacks/bootstrap-stack';
import { BudgetsStack } from './stacks/budgets-stack';
import { StatefulStack } from './stacks/stateful-stack';
import { StatelessStack } from './stacks/stateless-stack';

export interface AppOptions {
  readonly environments: readonly EnvironmentConfig[];
  readonly alertEmail: string;
  readonly webAssetPath: string;
  /**
   * Bootstrap stacks hold the roles the pipeline runs as, so the pipeline must never deploy
   * them. They are only added when deploying from a laptop with `-c bootstrap=true`.
   */
  readonly includeBootstrap: boolean;
}

/**
 * All stacks, created once per environment and split by lifecycle (ADR-0004):
 * bootstrap, budgets, stateful and stateless. Kept separate from bin/app.ts so tests can
 * build the whole app.
 */
export function buildApp(app: App, options: AppOptions): void {
  Tags.of(app).add('project', 'finance-app');

  for (const env of options.environments) {
    const awsEnv = { account: env.account, region: env.region };

    if (options.includeBootstrap) {
      new BootstrapStack(app, `Bootstrap-${env.name}`, {
        env: awsEnv,
        envName: env.name,
        github,
        trustedSubject: env.ci.trustedSubject,
        terminationProtection: true,
        description: `GitHub Actions OIDC provider and roles for the ${env.name} account`,
      });
    }

    new BudgetsStack(app, `Budgets-${env.name}`, {
      env: awsEnv,
      envName: env.name,
      monthlyLimitUsd: env.budget.monthlyLimitUsd,
      alertEmail: options.alertEmail,
      description: `Monthly cost budget and alerts for the ${env.name} account`,
    });

    const stateful = new StatefulStack(app, `Stateful-${env.name}`, {
      env: awsEnv,
      envName: env.name,
      terminationProtection: true,
      description: `Data-holding resources for ${env.name}: Cognito user pool`,
    });

    new StatelessStack(app, `Stateless-${env.name}`, {
      env: awsEnv,
      envName: env.name,
      userPool: stateful.userPool,
      userPoolDomain: stateful.userPoolDomain,
      webAssetPath: options.webAssetPath,
      allowLocalDev: env.name === 'dev',
      description: `Replaceable resources for ${env.name}: frontend, API, Lambdas`,
    });
  }

  for (const stack of app.node.children) {
    const envName = options.environments.find((e) => stack.node.id.endsWith(`-${e.name}`))?.name;
    if (envName) Tags.of(stack).add('environment', envName);
  }
}
