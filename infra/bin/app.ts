import { existsSync } from 'node:fs';
import { App } from 'aws-cdk-lib';
import { buildApp } from '../lib/app';
import { budgetAlertEmail, environments } from '../lib/config';
import { repoPath } from '../lib/paths';

const app = new App();

const webAssetPath = repoPath('packages/web/dist');
if (!existsSync(webAssetPath)) {
  throw new Error('packages/web/dist is missing. Run `pnpm build` before synth or deploy.');
}

buildApp(app, {
  environments: Object.values(environments),
  alertEmail: budgetAlertEmail(),
  webAssetPath,
  includeBootstrap: app.node.tryGetContext('bootstrap') === 'true',
});

app.synth();
