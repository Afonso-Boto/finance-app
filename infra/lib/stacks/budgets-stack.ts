import { createHash } from 'node:crypto';
import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
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
 * Why a custom resource: CloudFormation has no AWS::Budgets::Budget type in eu-north-1,
 * and the Region-deny SCP keeps stacks out of us-east-1. So the stack stays in eu-north-1
 * and a small Lambda (AwsCustomResource) calls the global Budgets API directly.
 *
 * Why the name contains a hash: the Budgets UpdateBudget call cannot change notifications.
 * Instead, any change to the configuration produces a new name, so CloudFormation creates
 * the new budget and then deletes the old one. The cost is that the budget's history in the
 * Billing console restarts whenever the configuration changes.
 *
 * Why credits and refunds are excluded: AWS includes them by default, so while free-plan
 * credits last the budget would see roughly $0 and never alert.
 */
export class BudgetsStack extends Stack {
  /** The budget name, including the configuration hash. */
  readonly budgetName: string;

  constructor(scope: Construct, id: string, props: BudgetsStackProps) {
    super(scope, id, props);

    const thresholds = props.thresholds ?? DEFAULT_THRESHOLDS;

    const budget = {
      BudgetType: 'COST',
      TimeUnit: 'MONTHLY',
      BudgetLimit: { Amount: String(props.monthlyLimitUsd), Unit: 'USD' },
      CostTypes: { IncludeCredit: false, IncludeRefund: false },
    };
    const notifications = thresholds.map((threshold) => ({
      Notification: {
        NotificationType: threshold.type,
        ComparisonOperator: 'GREATER_THAN',
        Threshold: threshold.percent,
        ThresholdType: 'PERCENTAGE',
      },
      Subscribers: [{ SubscriptionType: 'EMAIL', Address: props.alertEmail }],
    }));

    const configHash = createHash('sha256')
      .update(JSON.stringify({ budget, notifications }))
      .digest('hex')
      .slice(0, 8);
    this.budgetName = `finance-app-${props.envName}-monthly-${configHash}`;

    const accountId = this.account;
    const budgetArn = `arn:${this.partition}:budgets::${accountId}:budget/finance-app-${props.envName}-monthly-*`;

    new AwsCustomResource(this, 'MonthlyCostBudget', {
      resourceType: 'Custom::Budget',
      // onUpdate is left out on purpose: it defaults to onCreate, which creates the
      // new (renamed) budget; CloudFormation then deletes the old one via onDelete.
      onCreate: {
        service: 'Budgets',
        action: 'CreateBudget',
        // Budgets is a global service served from us-east-1.
        region: 'us-east-1',
        parameters: {
          AccountId: accountId,
          Budget: { BudgetName: this.budgetName, ...budget },
          NotificationsWithSubscribers: notifications,
        },
        physicalResourceId: PhysicalResourceId.of(this.budgetName),
      },
      onDelete: {
        service: 'Budgets',
        action: 'DeleteBudget',
        region: 'us-east-1',
        parameters: { AccountId: accountId, BudgetName: this.budgetName },
        ignoreErrorCodesMatching: 'NotFoundException',
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['budgets:ModifyBudget', 'budgets:ViewBudget'],
          resources: [budgetArn],
        }),
      ]),
      installLatestAwsSdk: false,
      logGroup: new LogGroup(this, 'BudgetHandlerLogs', {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
  }
}
