import { App } from 'aws-cdk-lib';

const app = new App();

// Stacks are added here as Phase 0 progresses, split by lifecycle (ADR-0004):
// bootstrap, budgets, stateful and stateless.

app.synth();
