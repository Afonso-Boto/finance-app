import { App, Tags } from 'aws-cdk-lib';
import { budgetAlertEmail, environments } from '../lib/config';
import { BudgetsStack } from '../lib/stacks/budgets-stack';

const app = new App();
Tags.of(app).add('project', 'finance-app');

// Stacks are split by lifecycle (ADR-0004): bootstrap, budgets, stateful and stateless.
// Each stack class is created once per environment; values come from lib/config.ts.
const alertEmail = budgetAlertEmail();

for (const env of Object.values(environments)) {
  const budgets = new BudgetsStack(app, `Budgets-${env.name}`, {
    env: { account: env.account, region: env.region },
    envName: env.name,
    monthlyLimitUsd: env.budget.monthlyLimitUsd,
    alertEmail,
    description: `Monthly cost budget and alerts for the ${env.name} account`,
  });
  Tags.of(budgets).add('environment', env.name);
}

app.synth();
