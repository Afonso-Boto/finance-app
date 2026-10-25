# ADR-0002: Tenancy and isolation model

- **Status:** accepted
- **Date:** 2026-10-19
- **Phase:** 0
- **Related:** ADR-0001 (key design), `docs/phases/phase-1.md` (Cedar policies, once written)


## Context

Users share data in workspaces (for example a household). A workspace is the unit of tenancy. The Phase 1 exit check requires that a cross-workspace read is denied by IAM even when the handler code is wrong, so isolation must not depend on application code alone.

Constraints:

- DynamoDB is the store (ADR-0001), with no VPC.
- Cost target of $5-10/month, so per-request overhead matters.
- Learning goal: policy-based authorization and tenant isolation.

## Options

### Option A: Workspace-prefixed keys with IAM LeadingKeys
Every workspace table has the workspace ID as the leading partition key value. Each request runs with credentials from `sts:AssumeRole` plus a session policy that allows only keys with that workspace's prefix (`dynamodb:LeadingKeys` condition).
- Pros: isolation is enforced by IAM, independent of handler bugs; meets the exit check; teaches real tenant isolation.
- Cons: an STS call per request (mitigated by caching); extra design work for keys and indexes; isolates only at workspace level.

### Option B: One table per workspace
- Pros: strong isolation by construction.
- Cons: table creation and lifecycle per workspace, awkward in CDK, does not scale operationally, and breaks the shared-infrastructure model.

### Option C: Application-only checks (handler logic and Cedar)
- Pros: simplest, no STS latency.
- Cons: a single handler bug can leak data; fails the Phase 1 exit check.

## Decision

We will use Option A as the hard boundary, with Cedar policies for authorization inside a workspace (roles, private accounts). Option C alone is rejected because it cannot satisfy the exit check. Option B is rejected on operational cost.

Shape (confirm):

- Workspace ID leads the partition key on every workspace table, with a fixed single prefix format (for example `WS#<id>`) so a LeadingKeys condition can match it. Every GSI must also lead with the workspace ID, otherwise LeadingKeys does not cover it.
- Per-request credentials come from AssumeRole with a scoped session policy, cached per workspace for the credential lifetime.
- Membership lives in a separate table keyed by user ID, because workspaces must be known before credentials can be scoped. It is read with a different, narrower role.
- The access token carries user identity only, never workspace permissions (as in `CLAUDE.md`).

## Consequences

- **Good:** cross-workspace reads are denied by IAM even if a handler is wrong; clear separation of "which workspace" (IAM) from "what may this user do in it" (Cedar).
- **Bad:** added latency and complexity per request; IAM cannot protect private accounts inside a shared workspace, so that privacy relies on Cedar alone (accepted residual risk); projection and feed Lambdas are cross-tenant by nature and outside this isolation, so they need their own tightly scoped roles and tests.
- **Follow-ups:**
  - STS latency and cost spike.
  - Cedar policy design in Phase 1.
  - A test that proves cross-workspace denial with a deliberately broken handler.

## Revisit when

- Measured STS overhead makes request latency unacceptable even with caching (set the threshold after the spike).
- Private accounts need stronger-than-Cedar protection, for example per-account keys.
- The number of workspaces or the session policy size hits IAM limits.

## Evidence

Pending: spike measuring AssumeRole latency (cold and cached) and cost, in `docs/phases/phase-0.md`.
