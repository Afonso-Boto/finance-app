# Phase 0: Foundations

**Target:** 2 weeks. **Plan reference:** `docs/project-plan.md`.

## Goal

A signed-in "hello world" deployed to prod entirely through the pipeline, with ADR-0001 to ADR-0004 written before any feature code.

## Exit check

All of these must pass before Phase 1 starts:

- [ ] A user signs in through Cognito on the prod CloudFront URL and the page shows the result of `GET /me`.
- [ ] That deployment came from the GitHub Actions pipeline, with no console changes.
- [ ] A pull request that makes `domain` import AWS or browser code fails CI.
- [ ] A Budgets alarm test notification arrives, in both accounts.
- [ ] Every log group has a retention period set in CDK.
- [ ] ADR-0001 to ADR-0004 are `accepted`, and the index is up to date.
- [ ] `CLAUDE.md` lists the real commands and the current phase.

## Week 1: foundations

- [ ] Docs scaffold: ADR template, ADR index, `docs/phases/`, `CLAUDE.md`
- [ ] AWS: dev and prod accounts, IAM Identity Center for human access, `cdk bootstrap` in both (eu-north-1). Identity Center lives in us-east-1.
- [ ] Confirm the free-plan credits apply to both accounts, and note their expiry
- [ ] Budgets alarms stack in each account, before anything else that can cost money
- [ ] Monorepo scaffold: pnpm workspaces (`domain`, `api`, `web`, `infra`), strict shared `tsconfig`, vitest
- [ ] Boundary check in CI: `domain` must not import AWS or browser code
- [ ] One small tested function in `domain`, so the pipeline has something real to run
- [ ] GitHub Actions with OIDC into both accounts (details below)

## Week 2: hello world and ADRs

- [ ] Stateful stack: Cognito user pool and client, termination protection
- [ ] Stateless stack: HTTP API with the JWT authorizer, `GET /me` Lambda, S3 + CloudFront for the SPA
- [ ] Frontend: sign-in with authorization code + PKCE, then a call to `/me`
- [ ] Observability: Lambda Powertools (structured logs, tracing, correlation IDs), log retention in CDK
- [ ] Spike: measure STS AssumeRole latency and cost for the LeadingKeys model (evidence for ADR-0002)
- [ ] ADR-0001 to ADR-0004 finalised

## Pipeline shape

- Every pull request (`ci.yml`): checks, then `cdk diff --method template` against dev and prod through the read-only diff role.
- Push to main (`deploy.yml`): checks, deploy dev, then deploy prod in the same run after approval in the `prod` GitHub Environment, so prod gets exactly the commit dev got.
- Both workflows call the same reusable `check.yml`.
- Bootstrap stacks are excluded from the pipeline: they only exist in the app with `-c bootstrap=true`.

## Gotchas

- **OIDC trust:** the issuer is `token.actions.githubusercontent.com`. The repo uses GitHub's immutable subject claims, so `sub` includes numeric IDs: `repo:Afonso-Boto@57546747/finance-app@1433468503:<context>`. The dev deploy role trusts `ref:refs/heads/main`, the prod deploy role only `environment:prod`, and the diff roles `pull_request`. A recreated repo gets a new ID and cannot inherit the trust. Check the format with `gh api repos/Afonso-Boto/finance-app/actions/oidc/customization/sub`.
- **Chicken-and-egg:** the OIDC provider and CI roles must exist before the pipeline can deploy. Create them once from a laptop with an admin profile as a small `bootstrap` stack, and document the exception in ADR-0004.
- **Cognito callback URL:** the app client needs the CloudFront domain, which exists only after the distribution. This affects where the stateful/stateless split sits.
- **Budgets in eu-north-1:** CloudFormation has no `AWS::Budgets::Budget` type there, so `BudgetsStack` uses an `AwsCustomResource` that calls the global Budgets API (us-east-1). The Region-deny SCP must exempt `budgets:*`. Any config change renames the budget (config hash), because UpdateBudget cannot change notifications.
- **Hello world design:** the frontend reads `/config.json`, written by the Stateless stack at deploy time, so one build serves every environment. The API is called cross-origin with CORS (allowed origins: the CloudFront URL, plus `localhost:5173` in dev only), rather than through CloudFront, to keep the Authorization header path simple. Cognito access tokens carry `client_id` instead of `aud`; API Gateway's JWT authorizer checks that against the app client.
- **SCP:** CloudFront is a global service (us-east-1), so the Region-deny SCP must exempt `cloudfront:*`, as it does `iam:*` and `budgets:*`.
- **Costs:** no NAT Gateway or VPC, log retention set everywhere, X-Ray sampling kept low. Enforce with a CDK aspect or lint rule, not memory.

## Open questions

- Frontend framework: decided as React + Vite + TypeScript (recorded in ADR-0004). Replace the Angular-specific entries in `.gitignore`.
- Do the free-plan credits cover both accounts and Bedrock model access? What happens to the accounts at expiry?
- Domain boundary enforcement: dependency-cruiser or eslint boundaries?

## Decisions made so far (to be written up as ADRs)

These are leanings from discussion, not accepted decisions.

- Data: DynamoDB as the source of truth. Aurora/RDS is a rejected option, mainly because the credits expire mid-pilot. A relational or Parquet projection can come later as a rebuild target.
- Architecture: modular monolith in one monorepo, not microservices. The shared market-data and news pipeline is the one candidate for its own stack.
