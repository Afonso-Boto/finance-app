import { Stack, type StackProps } from 'aws-cdk-lib';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import type { Construct } from 'constructs';

export interface BudgetThreshold {
  /** ACTUAL alerts on money already spent; FORECASTED on the projected month-end total. */
  readonly type: 'ACTUAL' | 'FORECASTED';
  /** Percentage of the monthly limit. */
  readonly percent: number;
}

/** Early warning at half the limit, a nudge at 80%, and alerts at or past the limit. */
export const DEFAULT_THRESHOLDS: readonly BudgetThreshold[] = [
  { type: 'ACTUAL', percent: 50 },
  { type: 'ACTUAL', percent: 80 },
  { type: 'ACTUAL', percent: 100 },
  { type: 'FORECASTED', percent: 100 },
];

export interface BudgetsStackProps extends StackProps {
  readonly envName: string;
  readonly monthlyLimitUsd: number;
  readonly alertEmail: string;
  readonly thresholds?: readonly BudgetThreshold[];
}

/**
 * A monthly cost budget for one account, with email alerts.
 *
 * Credits and refunds are excluded on purpose: AWS includes them by default, so while
 * free-plan credits last the budget would see roughly $0 and never alert.
 */
export class BudgetsStack extends Stack {
  constructor(scope: Construct, id: string, props: BudgetsStackProps) {
    super(scope, id, props);

    const thresholds = props.thresholds ?? DEFAULT_THRESHOLDS;

    new CfnBudget(this, 'MonthlyCostBudget', {
      budget: {
        budgetName: `finance-app-${props.envName}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyLimitUsd, unit: 'USD' },
        costTypes: {
          includeCredit: false,
          includeRefund: false,
        },
      },
      notificationsWithSubscribers: thresholds.map((threshold) => ({
        notification: {
          notificationType: threshold.type,
          comparisonOperator: 'GREATER_THAN',
          threshold: threshold.percent,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
      })),
    });
  }
}
