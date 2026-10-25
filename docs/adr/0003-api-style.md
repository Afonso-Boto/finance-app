# ADR-0003: API style

- **Status:** accepted
- **Date:** 2026-10-19
- **Phase:** 0
- **Related:** ADR-0001, ADR-0002 (workspace scoping and credentials), `CLAUDE.md` hard rules (idempotency keys, `If-Match`)


## Context

The browser app talks to a Lambda backend through an API. The domain is event-sourced: writes are things that happen (record a transaction, import a file), and reads come from projections.

Constraints:

- Serverless only, cost target $5-10/month. API Gateway HTTP API is the cheapest fit and has a native Cognito JWT authorizer.
- The domain package is TypeScript, and the frontend is a TypeScript SPA.
- Hard rules already require client-generated UUIDv7 ids, an idempotency key on every write, and version checks with `If-Match` on editable records.
- Live updates (WebSockets) are a Phase 8 stretch goal, not a pilot requirement.

## Options

### Option A: REST with OpenAPI and generated TypeScript types
- Pros: idempotency keys, `If-Match` and ETags map directly onto HTTP; works with the HTTP API's JWT authorizer; a written contract the owner can review; generated client keeps the frontend in sync; transferable skill.
- Cons: more endpoints than GraphQL for nested views; HTTP API has no built-in request validation (done in the Lambda); no subscriptions.

### Option B: GraphQL with AppSync
- Pros: flexible client queries, built-in subscriptions, resolvers without Lambda for simple cases.
- Cons: idempotency and optimistic concurrency are awkward to express; resolvers add a second logic layer away from the domain package; schema and VTL/JS resolver learning is mostly tool-specific; a different auth model to reconcile with ADR-0002.

### Option C: Typed RPC over HTTP (tRPC style)
- Pros: end-to-end types with no spec; very little ceremony in a TypeScript monorepo.
- Cons: no language-neutral contract, tied to TypeScript clients, and less aligned with HTTP semantics (ETags, status codes, caching). Weaker for the "could become commercial" case.

## Decision

We will use REST with an OpenAPI contract (Option A), on API Gateway HTTP API with the Cognito JWT authorizer. Option B's main advantage is subscriptions, which are a Phase 8 stretch goal and can be added separately.

Shape (confirm):

- **Writes are commands, not generic CRUD.** Example: `POST /workspaces/{workspaceId}/transactions` records a transaction (an event), instead of a PUT that mutates a row. This suits event sourcing.
- Every write requires an `Idempotency-Key` header. Updates to editable records require `If-Match` with the record version; stale writes get `412`.
- Workspace ID is in the path. The handler resolves membership and obtains scoped credentials as defined in ADR-0002.
- Errors use `application/problem+json` (RFC 9457) with a stable error code.
- Lists use cursor pagination.
- No URL versioning in the pilot. Changes stay additive; revisit if a breaking change is needed.

**OPEN: source of truth for schemas.** Pick one and record why.

- *OpenAPI first:* the spec file is hand-reviewed and the types and validators are generated from it. Best fit for "the owner writes the thinking", and the contract is a reviewable artifact.
- *Zod first:* schemas live in TypeScript (possibly in `domain`), and the OpenAPI document is generated from them. One definition for runtime validation and types, but the contract is a build output rather than something you write.

My lean is OpenAPI first, with runtime validation in the Lambda generated from the same spec.

## Consequences

- **Good:** a reviewable contract; HTTP semantics for idempotency and concurrency; cheap, simple auth; the frontend client is generated.
- **Bad:** request validation must be wired in the Lambda; more endpoints than GraphQL for composite screens; real-time updates need a separate mechanism later.
- **Follow-ups:**
  - Choose the schema source of truth (above).
  - Choose the generator toolchain.
  - Define the idempotency record and its retention window in `phase-1.md`.
  - A first `openapi.yaml` with `GET /me` in Phase 0.

## Revisit when

- Screens need many round trips or deeply nested reads that REST makes painful.
- Real-time updates become a core requirement rather than a stretch goal (then evaluate AppSync subscriptions or API Gateway WebSockets).
- A second client appears with different data needs.

## Evidence

None yet. A Phase 0 `GET /me` with a generated client will show the toolchain working end to end.
