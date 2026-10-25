import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BudgetsStack } from './budgets-stack';

function synth(): Template {
  const app = new App();
  const stack = new BudgetsStack(app, 'Budgets-test', {
    envName: 'test',
    monthlyLimitUsd: 5,
    alertEmail: 'alerts@example.com',
  });
  return Template.fromStack(stack);
}

describe('BudgetsStack', () => {
  it('creates one monthly cost budget with the configured limit', () => {
    const template = synth();
    template.resourceCountIs('AWS::Budgets::Budget', 1);
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        BudgetName: 'finance-app-test-monthly',
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: { Amount: 5, Unit: 'USD' },
      }),
    });
  });

  it('excludes credits and refunds, so alerts reflect real spend', () => {
    synth().hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({
        CostTypes: { IncludeCredit: false, IncludeRefund: false },
      }),
    });
  });

  it('alerts by email at 50/80/100% actual and 100% forecasted', () => {
    const budgets = synth().findResources('AWS::Budgets::Budget');
    const [budget] = Object.values(budgets);
    const notifications = budget?.Properties.NotificationsWithSubscribers as {
      Notification: { NotificationType: string; Threshold: number };
      Subscribers: { SubscriptionType: string; Address: string }[];
    }[];

    expect(
      notifications.map((n) => `${n.Notification.NotificationType}:${n.Notification.Threshold}`),
    ).toEqual(['ACTUAL:50', 'ACTUAL:80', 'ACTUAL:100', 'FORECASTED:100']);
    for (const n of notifications) {
      expect(n.Subscribers).toEqual([{ SubscriptionType: 'EMAIL', Address: 'alerts@example.com' }]);
    }
  });
});
