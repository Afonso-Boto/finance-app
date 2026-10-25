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

## Deploying infrastructure

The pipeline deploys everything except the bootstrap stacks:

| Event | What runs |
| --- | --- |
| Pull request | Checks, then `cdk diff` against dev and prod (read-only diff role) |
| Push to `main` | Checks, deploy dev, then deploy prod after approval in the `prod` environment |

Bootstrap stacks (GitHub OIDC provider and roles) are deployed from a laptop only, because the
pipeline runs as the roles they define. They only exist in the CDK app with `-c bootstrap=true`:

```
aws sso login --profile finance-dev
pnpm --filter @finance/infra exec cdk deploy Bootstrap-dev -c bootstrap=true --profile finance-dev
pnpm --filter @finance/infra exec cdk deploy Bootstrap-prod -c bootstrap=true --profile finance-prod
```

`BUDGET_ALERT_EMAIL` must be set for every `cdk` command (e.g. exported in `~/.zshrc`).
Account IDs, Regions and budget limits live in `infra/lib/config.ts`; the workflows repeat the
account IDs, and `infra/lib/workflows.test.ts` fails if they drift apart.

GitHub setup (once):

- Repository secret `BUDGET_ALERT_EMAIL`.
- Environment `prod`: required reviewer (you), deployment branches limited to `main`.
