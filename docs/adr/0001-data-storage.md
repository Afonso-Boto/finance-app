# ADR-0001: Where does data live?

- **Status:** accepted
- **Date:** 2026-10-19
- **Phase:** 0
- **Related:** ADR-0002 (key design is the isolation design), `docs/phases/phase-1.md` (access patterns, once written)


## Context

The app records a double-entry ledger as append-only events and derives everything else (balances, holdings, budgets) as projections that can be rebuilt. It is multi-user, with shared reference data (instruments, prices, FX, articles) alongside per-workspace data.

Constraints that shape the choice:

- Serverless only: no VPC, no always-on compute (see `CLAUDE.md` cost guardrails).
- Target running cost of $5-10/month. AWS free-plan credits are $100 and expire after 6 months, roughly the whole pilot.
- The main goal is learning. DynamoDB event modelling is the path the owner wants to learn; a relational store is of interest but secondary.

## Options

### Option A: DynamoDB as the source of truth
- Pros: no VPC, pay per request (near zero at this scale), fits an event store and Streams-driven projections, matches the learning goal.
- Cons: ad hoc analytical queries (returns, category history) are awkward; access patterns must be designed up front.

### Option B: Aurora Serverless v2 / RDS Postgres
- Pros: the ledger is naturally relational (constraints, transactions, balance checks in SQL); a common skill; flexible reporting.
- Cons: needs a VPC (RDS Proxy or connection management for Lambda, endpoints or NAT for everything else); resume delay after auto-pause; storage cost; the credits expire mid-pilot, leaving a cost cliff. Isolation would move to row-level security instead of IAM.

### Option C: DynamoDB for writes plus Parquet on S3 for analytics
- Pros: keeps the DynamoDB write path and adds SQL (DuckDB or Athena) for ad hoc questions, with no VPC.
- Cons: a second pipeline to build and keep consistent; not needed before there are real analytical queries.

## Decision

We will use DynamoDB as the source of truth (Option A). A relational or Parquet read model is allowed later as a disposable projection rebuilt from events (Option C's idea), once Phase 3 creates real analytical queries.

Why: it satisfies the no-VPC and cost constraints, it is the stated learning goal, and the rebuildable-projection design means analytics can be added later without touching the write side. Option B is rejected mainly on cost after the credits expire, VPC requirements and resume latency.

Shape (confirm):

- A few purpose-built tables: **events**, **projections**, **reference** (shared data) and **membership** (user to workspaces). Single-table design applies inside each table, not across them. Keeping reference and workspace data in separate tables keeps the IAM isolation story clean.
- Events are sequenced per workspace with a version counter and conditional writes.

## Consequences

- **Good:** near-zero idle cost, no VPC, a clear event-sourcing learning path, projections are disposable.
- **Bad:** reporting needs a derived store; every access pattern must be designed before use; DynamoDB Streams ordering is per partition key only, so projections must not assume cross-workspace order.
- **Follow-ups:**
  - Idempotency key storage (design in `phase-1.md`).
  - Key and GSI design, coordinated with ADR-0002.
  - ADR-0006 (event schema versioning).
  - Decide how data is exported or retained when the free-plan credits expire. Confirm the credit scope (both accounts) and expiry date.
  - Optional Phase 3 spike: local Postgres in Docker or Parquet + DuckDB as a projection target.

## Revisit when

- Analytical queries become the dominant workload, or projections can no longer answer the reporting questions.
- The pilot turns commercial and the cost model changes.
- Monthly cost exceeds the $5-10 target once credits end.

## Evidence

None yet. Credits: $100, expiring in 6 months (owner-stated).
