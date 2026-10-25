# CLAUDE.md

Finance App: a multi-user browser app for budgeting and investment tracking on serverless AWS. The main goal is the owner's skill growth in design, architecture and implementation. A usable product is secondary.

## Current phase

**Phase 0: Foundations** (target: weeks 0-2)

Exit check: a signed-in "hello world" deployed to prod entirely through the pipeline, plus the extra checks listed in `docs/phases/phase-0.md`.

Update this section when a phase closes. A phase closes only when its exit check passes.

## Working method

The owner writes the thinking, Claude Code writes most of the typing.

- The owner writes ADRs, domain models, access-pattern tables, invariants, key tests and exit checks **before** prompting for implementation.
- Claude Code implements against those documents, in small pull requests.
- If an ADR is missing for a decision you are about to make, **stop and say so**. Do not decide silently.
- Prefer explaining a trade-off over hiding it. Code the owner cannot explain will be rejected.

## ADRs are binding

- ADRs live in `docs/adr/` as `NNNN-short-title.md`, written from `docs/adr/template.md`. The index is `docs/adr/README.md`.
- Only **accepted** ADRs are binding. Proposed ones are discussion material.
- Never edit an accepted ADR except for its status line. To change a decision, propose a **new** ADR that supersedes it.
- If your implementation would deviate from an accepted ADR, stop and propose a new ADR instead.
- Per-phase designs (domain model, DynamoDB access patterns) live in `docs/phases/phase-N.md`. These are designs, not decisions.

## Architecture summary

Fully serverless, no VPC, eu-north-1 (an SCP denies other Regions; IAM Identity Center lives in us-east-1). The server is the source of truth. Ledger events are the core record; everything else is a projection built from them and can be rebuilt.

- **Frontend:** single-page app on S3 + CloudFront (default domain).
- **Auth:** Cognito user pool. The access token carries user identity only, never workspace permissions.
- **API:** API Gateway HTTP API to Lambda (TypeScript). Style is decided in ADR-003.
- **Domain package:** pure TypeScript with no AWS or browser dependencies (ledger rules, portfolio maths, rule evaluation).
- **Event store:** append-only ledger events in DynamoDB, keyed by workspace.
- **Projections:** DynamoDB Streams to Lambda (balances, holdings, budgets).
- **Shared pipelines:** EventBridge Scheduler triggers market-data and news ingestion once for all users.
- **Rules and feed workers:** scheduled and event-driven Lambdas per workspace.
- **LLM:** Bedrock, small models only, behind a daily budget cap.

Details and rationale are in the ADRs. This summary is a pointer, not a source of truth.

## Repository layout

Monorepo (pnpm workspaces). Layout is finalised in ADR-004.

- `packages/domain`: pure logic, no I/O
- `packages/api`: Lambda handlers
- `packages/web`: browser app
- `infra/`: CDK stacks
- `docs/`: ADRs and phase designs

## Hard rules

- **No AWS or browser imports in `domain`.** CI enforces this.
- **Money is integer minor units plus a currency code. Never floats.**
- **Every write carries a client-generated UUIDv7 and an idempotency key.** Retries must be safe.
- **Editable records carry a version number.** Stale writes are rejected with `If-Match`.
- **Workspace ID leads every DynamoDB key.** Never query across workspaces from a request handler.
- **Reference data** (instruments, prices, FX, articles) is separate from **workspace data** (ledger, rules, theses, feeds).
- **Ledger corrections are reversal entries.** Never update or delete events.
- **Suggestions only come from rules the user wrote.** The app never generates predictions or buy/sell advice.

## Cost guardrails

Target is under $5-10 a month. Do not introduce:

- NAT Gateway, ALB, WAF, interface VPC endpoints, or Secrets Manager (use SSM SecureString)
- Any always-on compute
- Log groups without a retention period set in CDK

Flag any change that could add a recurring cost before making it.

## Conventions

- TypeScript strict mode everywhere.
- Tests with vitest. Property-based tests for ledger invariants. Golden files for CSV import.
- Infrastructure is defined only in CDK. No console changes.
- Small, focused pull requests, one concern each, linked to a phase issue.
- Structured logging with correlation IDs (Lambda Powertools).
- Commit messages in conventional style (`feat:`, `fix:`, `docs:`, `chore:`).

## Commands

Run from the repo root (full tables in `README.md`):

- `pnpm install`: install all workspace packages
- `pnpm check`: lint, typecheck and test everything; run this before every commit
- `pnpm lint:fix`: apply Biome lint and format fixes
- `pnpm --filter <package> <script>`: run one package's script, e.g. `pnpm --filter @finance/domain test`
- `pnpm --filter @finance/infra synth`: `cdk synth` (needs `BUDGET_ALERT_EMAIL` set)
- Bootstrap stacks deploy from a laptop only, with `-c bootstrap=true` (see `README.md`). The pipeline must never deploy them.

Tooling notes:

- Lint and format use Biome (`biome.json`), not ESLint: typescript-eslint does not support TypeScript 7 yet.
- The `domain` boundary is enforced twice: Biome `noRestrictedImports`, and the domain tsconfig has no Node or DOM types.
- Packages consume `@finance/domain` from TypeScript source (`exports` points at `src/index.ts`). There is no build step between packages.
- Dependency install scripts are blocked by default. Allow one only by adding it to `allowBuilds` in `pnpm-workspace.yaml`.
- Account IDs live in `infra/lib/config.ts`; the workflows repeat them and `infra/lib/workflows.test.ts` checks they match.

## Out of scope for the pilot

Bank or broker connections, native mobile app, offline mode, predictions or advice, payments. Stretch goals live in Phase 8 only.