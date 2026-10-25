import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  FeaturePlan,
  ManagedLoginVersion,
  Mfa,
  UserPool,
  type UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

export interface StatefulStackProps extends StackProps {
  readonly envName: string;
}

/**
 * Resources that hold data and must survive any redeploy (ADR-0004): for now the Cognito
 * user pool. Retained on delete, deletion protection on, and the stack itself is
 * termination-protected (bin/app.ts).
 */
export class StatefulStack extends Stack {
  readonly userPool: UserPool;
  readonly userPoolDomain: UserPoolDomain;

  constructor(scope: Construct, id: string, props: StatefulStackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `finance-app-${props.envName}`,
      featurePlan: FeaturePlan.ESSENTIALS,
      // Invite-only: the app is on a public URL, and the pilot has known users.
      // Users are created with `aws cognito-idp admin-create-user` (README).
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 12, tempPasswordValidity: Duration.days(3) },
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // The hosted sign-in pages. The prefix must be unique per Region, hence the account ID.
    this.userPoolDomain = this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `finance-app-${props.envName}-${this.account}` },
      managedLoginVersion: ManagedLoginVersion.CLASSIC_HOSTED_UI,
    });
  }
}
