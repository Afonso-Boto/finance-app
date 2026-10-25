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

- Every pull request: lint, test, boundary check, `cdk synth`, and `cdk diff` posted to the PR.
- Merge to main: deploy dev automatically.
- Prod: deploy the same commit through a GitHub Environment (`prod`) that requires your approval.

## Gotchas

- **OIDC trust:** the issuer is `token.actions.githubusercontent.com`. Scope each role on the `sub` claim to this repository: `repo:Afonso-Boto/finance-app:ref:refs/heads/main` for dev, and `repo:Afonso-Boto/finance-app:environment:prod` for prod, so only the approved `prod` environment can assume the prod role. The CI role needs only `sts:AssumeRole` on the CDK bootstrap roles.
- **Chicken-and-egg:** the OIDC provider and CI roles must exist before the pipeline can deploy. Create them once from a laptop with an admin profile as a small `bootstrap` stack, and document the exception in ADR-0004.
- **Cognito callback URL:** the app client needs the CloudFront domain, which exists only after the distribution. This affects where the stateful/stateless split sits.
- **Costs:** no NAT Gateway or VPC, log retention set everywhere, X-Ray sampling kept low. Enforce with a CDK aspect or lint rule, not memory.

## Open questions

- Frontend framework: decided as React + Vite + TypeScript (recorded in ADR-0004). Replace the Angular-specific entries in `.gitignore`.
- Do the free-plan credits cover both accounts and Bedrock model access? What happens to the accounts at expiry?
- Domain boundary enforcement: dependency-cruiser or eslint boundaries?

## Decisions made so far (to be written up as ADRs)

These are leanings from discussion, not accepted decisions.

- Data: DynamoDB as the source of truth. Aurora/RDS is a rejected option, mainly because the credits expire mid-pilot. A relational or Parquet projection can come later as a rebuild target.
- Architecture: modular monolith in one monorepo, not microservices. The shared market-data and news pipeline is the one candidate for its own stack.
