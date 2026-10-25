# ADR-0004: Repository and deployment layout

- **Status:** accepted
- **Date:** 2026-10-19
- **Phase:** 0
- **Related:** ADR-0001, ADR-0002, ADR-0003, `docs/phases/phase-0.md`


## Context

One developer, a TypeScript codebase, serverless AWS in eu-north-1, two workload AWS accounts (dev and prod) under an AWS Organization, GitHub for source and CI. The goal is learning architecture and delivery, with cost kept to $5-10/month.

The system already has independently deployed units: the API, projection workers, shared market-data and news ingestion, and rules/feed workers. They communicate through events and reference data.

## Options

### Option A: Modular monolith in one monorepo
- Pros: a feature usually touches a Lambda, its infrastructure and the API contract together, so one pull request and one pipeline; docs, ADRs and `CLAUDE.md` sit next to the code; least overhead for one developer.
- Cons: boundaries must be enforced by tooling, not by the repo split; the pipeline needs path rules if it gets slow.

### Option B: Separate repositories (application and CDK)
- Pros: independent release cadence and permissions.
- Cons: no team, permission or cadence difference to justify it; cross-repo changes for every feature; version pinning between repos.

### Option C: Microservices, one repo or service each
- Pros: strong isolation; resembles large-organization practice.
- Cons: for one developer, it adds service discovery, contracts, versioning and per-service deployment without much extra design learning. Most of the learning is in the boundaries, not the network hops.

## Decision

We will use a pnpm-workspace monorepo with a modular monolith (Option A). Independently deployed Lambdas communicating through events already give the failure-isolation and eventual-consistency lessons of a distributed system.

### Packages

- `packages/domain`: pure TypeScript, split by bounded context (ledger, portfolio, budgeting, rules, news). No AWS or browser imports. Contexts talk through events or explicit interfaces, never through each other's internals.
- `packages/api`: Lambda handlers.
- `packages/web`: the browser app (see "Frontend" below).
- `infra/`: CDK app.
- Boundaries (`domain` imports no AWS or browser code; contexts do not reach into each other) are enforced in CI with Biome (`noRestrictedImports` scoped to `packages/domain`), backed by the domain tsconfig having no Node or DOM types. Biome also does linting and formatting. ESLint was not chosen because typescript-eslint does not support TypeScript 7; dependency-cruiser stays an option if context-to-context rules outgrow Biome.
- The shared market-data and news pipeline is the one place with a real service boundary (shared data, different cadence, independent failure). It gets its own package and stack, and talks to the rest only through reference data (confirm when Phase 3 starts).

### Stacks, split by lifecycle (confirm)

- **bootstrap:** GitHub OIDC provider and CI roles. Created once from a laptop with an admin profile, then never touched by the pipeline. This is a documented exception to "no console/manual changes".
- **budgets:** Budgets alarms, one small stack per account, deployed first.
- **stateful:** DynamoDB tables, Cognito user pool, data buckets. Termination protection on, removal policy retain.
- **stateless:** Lambdas, HTTP API, SPA bucket, CloudFront, Cognito app client. Safe to replace.
- The Cognito app client lives in the stateless stack, because it needs the CloudFront domain for callback URLs and holds no user data. The user pool stays in the stateful stack.

### Environments and delivery

- Three accounts in one AWS Organization: a management account (billing, Organizations, IAM Identity Center; no workloads), and dev and prod in a `Workloads` OU. No staging account in the pilot.
- Workload Region is eu-north-1 (Stockholm): lower cost, and an SCP on `Workloads` denies other Regions apart from the global services. IAM Identity Center runs in us-east-1. Bedrock model availability in eu-north-1 must be checked before Phase 4; cross-Region inference would need an SCP exception.
- Human access is through IAM Identity Center only. Member-account root credentials are removed with centralized root access.
- GitHub Actions authenticates to AWS with OIDC (`token.actions.githubusercontent.com`). Each role trusts only this repository's `sub` claim: `main` for dev, and the `prod` GitHub Environment for prod. The CI roles may only assume the CDK bootstrap roles.
- Every pull request: lint, tests, boundary check, `cdk synth`, and `cdk diff` posted to the PR.
- Merge to main deploys dev automatically. Prod deploys the same commit through the `prod` GitHub Environment, which requires the owner's approval.
- Lambdas are bundled with esbuild through `NodejsFunction`. Trunk-based development with short-lived branches.

### Frontend

React + Vite + TypeScript as a plain SPA, served from S3 + CloudFront. No SSR and no meta-framework. TanStack Query for server state, a router, one component library, and a client generated from the OpenAPI spec (ADR-0003). Sign-in uses the Cognito hosted UI with authorization code + PKCE through an OIDC client library.

Why: the owner wants to spend learning effort elsewhere and most frontend code will be written by Claude Code. React has the strongest ecosystem for tables, charts and OIDC, and a small stack is easier to explain and maintain. Angular was considered and not chosen because its structure is heavier than this project needs.

## Consequences

- **Good:** one pull request per feature, docs next to code, cheap and simple pipeline, clear stateful/stateless blast-radius control.
- **Bad:** boundaries are only as strong as the CI check; the bootstrap stack is a manual exception; no staging environment means prod is the first realistic test of some changes.
- **Follow-ups:**
  - Pick the boundary tool.
  - Fill the Commands section of `CLAUDE.md` as the scaffold lands.
  - Update the layout in `CLAUDE.md` if it differs from this ADR.

## Revisit when

Extract a context into its own service only if it has a different scaling profile, release cadence or ownership (for example, the news pipeline growing its own team or load). Also revisit if:

- CI time becomes a problem (use path filters on the GitHub Actions workflows first, split the repo last).
- Prod regressions suggest a staging environment is worth its cost.
- A second developer joins and ownership boundaries appear.

## Evidence

None yet. Phase 0 delivers the working scaffold and pipeline that confirms or corrects the stack split.
