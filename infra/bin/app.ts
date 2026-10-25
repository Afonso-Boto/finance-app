import { App, Tags } from 'aws-cdk-lib';
import { budgetAlertEmail, environments, github } from '../lib/config';
import { BootstrapStack } from '../lib/stacks/bootstrap-stack';
import { BudgetsStack } from '../lib/stacks/budgets-stack';

const app = new App();
Tags.of(app).add('project', 'finance-app');

// Stacks are split by lifecycle (ADR-0004): bootstrap, budgets, stateful and stateless.
// Each stack class is created once per environment; values come from lib/config.ts.
const alertEmail = budgetAlertEmail();
const includeBootstrap = app.node.tryGetContext('bootstrap') === 'true';

for (const env of Object.values(environments)) {
  const awsEnv = { account: env.account, region: env.region };

  // Bootstrap stacks hold the roles the pipeline runs as, so the pipeline must never
  // deploy them. They only exist in the app when deploying from a laptop with
  // `-c bootstrap=true`, which keeps them out of every `cdk deploy '*-dev'` in CI.
  const bootstrap = includeBootstrap
    ? new BootstrapStack(app, `Bootstrap-${env.name}`, {
        env: awsEnv,
        envName: env.name,
        github,
        trustedSubject: env.ci.trustedSubject,
        terminationProtection: true,
        description: `GitHub Actions OIDC provider and roles for the ${env.name} account`,
      })
    : undefined;

  const budgets = new BudgetsStack(app, `Budgets-${env.name}`, {
    env: awsEnv,
    envName: env.name,
    monthlyLimitUsd: env.budget.monthlyLimitUsd,
    alertEmail,
    description: `Monthly cost budget and alerts for the ${env.name} account`,
  });

  for (const stack of [bootstrap, budgets]) {
    if (stack) Tags.of(stack).add('environment', env.name);
  }
}

app.synth();
