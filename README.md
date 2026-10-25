# finance-app

Budgeting and investment tracking on serverless AWS. A learning project first, a usable app second.
See `docs/project-plan.md` for the plan, `docs/adr/` for decisions and `docs/phases/` for per-phase designs.

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm, via Corepack: `corepack enable` (the version is pinned in `package.json`)

## Layout

| Path | Package | Purpose |
| --- | --- | --- |
| `packages/domain` | `@finance/domain` | Pure domain logic. No AWS, Node or browser imports. |
| `packages/api` | `@finance/api` | Lambda handlers |
| `packages/web` | `@finance/web` | Browser app (React + Vite) |
| `infra` | `@finance/infra` | AWS CDK app |

## Commands

Run from the repo root:

| Command | What it does |
| --- | --- |
| `pnpm install` | Install all workspace packages |
| `pnpm check` | Lint, typecheck and test everything (what CI runs) |
| `pnpm lint` / `pnpm lint:fix` | Biome lint and format check / apply fixes |
| `pnpm typecheck` | `tsc` in every package |
| `pnpm test` | Vitest in every package |
| `pnpm --filter @finance/domain test` | Run one package's script |
| `pnpm --filter @finance/infra synth` | `cdk synth` |

## Deploying infrastructure (from a laptop, until the deploy pipeline exists)

Sign in once with `aws sso login --profile finance-dev`, then from the repo root:

```
BUDGET_ALERT_EMAIL=you@example.com pnpm --filter @finance/infra exec cdk diff Budgets-dev --profile finance-dev
BUDGET_ALERT_EMAIL=you@example.com pnpm --filter @finance/infra exec cdk deploy Budgets-dev --profile finance-dev
```

Account IDs, Regions and budget limits live in `infra/lib/config.ts`. The alert email is passed in
through `BUDGET_ALERT_EMAIL` so it is not committed.
