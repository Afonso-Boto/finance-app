import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { StatefulStack } from './stateful-stack';

function synth(): Template {
  const stack = new StatefulStack(new App(), 'Stateful-test', {
    env: { account: '111111111111', region: 'eu-north-1' },
    envName: 'test',
  });
  return Template.fromStack(stack);
}

describe('StatefulStack', () => {
  it('keeps the user pool on stack deletion and protects it from deletion', () => {
    synth().hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: { DeletionProtection: 'ACTIVE' },
    });
  });

  it('is invite-only: users cannot sign themselves up', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  it('signs in with email and offers TOTP MFA, never SMS', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      MfaConfiguration: 'OPTIONAL',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    });
  });

  it('creates the hosted sign-in domain with an account-specific prefix', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'finance-app-test-111111111111',
    });
  });
});
