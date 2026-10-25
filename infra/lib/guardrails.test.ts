import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { environments } from './config';
import { fakeWebAssets } from './test-support';

/**
 * Cost and operations guardrails from CLAUDE.md, checked across every stack in the app,
 * including resources that CDK constructs create behind the scenes.
 */
const app = new App();
buildApp(app, {
  environments: Object.values(environments),
  alertEmail: 'alerts@example.com',
  webAssetPath: fakeWebAssets(),
  includeBootstrap: true,
});
const stacks = app.node.children.filter((c): c is Stack => c instanceof Stack);
const templates = stacks.map((stack) => ({
  name: stack.stackName,
  template: Template.fromStack(stack),
}));

describe('guardrails (all stacks)', () => {
  it('builds every stack for every environment', () => {
    expect(stacks.map((s) => s.stackName).sort()).toEqual(
      ['Bootstrap', 'Budgets', 'Stateful', 'Stateless']
        .flatMap((kind) => Object.keys(environments).map((env) => `${kind}-${env}`))
        .sort(),
    );
  });

  it.each(templates)(
    '$name: every Lambda logs to a log group with a retention period',
    ({ template }) => {
      const logGroups = template.findResources('AWS::Logs::LogGroup');
      for (const group of Object.values(logGroups)) {
        expect(group.Properties.RetentionInDays).toBeGreaterThan(0);
      }
      // A Lambda without an explicit log group gets one created at runtime, with no retention.
      for (const fn of Object.values(template.findResources('AWS::Lambda::Function'))) {
        expect(fn.Properties.LoggingConfig?.LogGroup).toBeDefined();
      }
    },
  );

  it.each(templates)('$name: no VPC, NAT Gateway or always-on compute', ({ template }) => {
    const types = Object.values(
      template.toJSON().Resources as Record<string, { Type: string }>,
    ).map((r) => r.Type);
    const forbidden = types.filter((t) =>
      /^AWS::(EC2|ECS|RDS|ElasticLoadBalancingV2|SecretsManager)::/.test(t),
    );
    expect(forbidden).toEqual([]);
  });
});
