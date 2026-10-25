import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BudgetsStack, type BudgetsStackProps } from './budgets-stack';

const baseProps: BudgetsStackProps = {
  env: { account: '111111111111', region: 'eu-north-1' },
  envName: 'test',
  monthlyLimitUsd: 5,
  alertEmail: 'alerts@example.com',
};

function synth(props: Partial<BudgetsStackProps> = {}) {
  const stack = new BudgetsStack(new App(), 'Budgets-test', { ...baseProps, ...props });
  return { stack, template: Template.fromStack(stack) };
}

/** The SDK call the custom resource makes on create, parsed from the template. */
function createCall(template: Template) {
  const [resource] = Object.values(template.findResources('Custom::Budget'));
  return JSON.parse(resource?.Properties.Create as string);
}

describe('BudgetsStack', () => {
  it('calls CreateBudget on the global Budgets endpoint for this account', () => {
    const call = createCall(synth().template);
    expect(call).toMatchObject({ service: 'Budgets', action: 'CreateBudget', region: 'us-east-1' });
    expect(call.parameters.AccountId).toBe('111111111111');
    expect(call.parameters.Budget).toMatchObject({
      BudgetType: 'COST',
      TimeUnit: 'MONTHLY',
      BudgetLimit: { Amount: '5', Unit: 'USD' },
    });
  });

  it('excludes credits and refunds, so alerts reflect real spend', () => {
    const call = createCall(synth().template);
    expect(call.parameters.Budget.CostTypes).toEqual({
      IncludeCredit: false,
      IncludeRefund: false,
    });
  });

  it('alerts by email at 50/80/100% actual and 100% forecasted', () => {
    const notifications = createCall(synth().template).parameters.NotificationsWithSubscribers as {
      Notification: { NotificationType: string; Threshold: number };
      Subscribers: unknown[];
    }[];
    expect(
      notifications.map((n) => `${n.Notification.NotificationType}:${n.Notification.Threshold}`),
    ).toEqual(['ACTUAL:50', 'ACTUAL:80', 'ACTUAL:100', 'FORECASTED:100']);
    for (const n of notifications) {
      expect(n.Subscribers).toEqual([{ SubscriptionType: 'EMAIL', Address: 'alerts@example.com' }]);
    }
  });

  it('renames the budget when its configuration changes, and only then', () => {
    const a = synth().stack.budgetName;
    expect(synth().stack.budgetName).toBe(a);
    expect(synth({ monthlyLimitUsd: 10 }).stack.budgetName).not.toBe(a);
    expect(a).toMatch(/^finance-app-test-monthly-[0-9a-f]{8}$/);
  });

  it('scopes the handler permissions to this project budgets', () => {
    synth().template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['budgets:ModifyBudget', 'budgets:ViewBudget'],
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  { Ref: 'AWS::Partition' },
                  ':budgets::111111111111:budget/finance-app-test-monthly-*',
                ],
              ],
            },
          }),
        ]),
      },
    });
  });

  it('gives the handler log group a retention period', () => {
    synth().template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });
});
