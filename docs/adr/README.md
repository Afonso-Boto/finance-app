# Architecture Decision Records

One decision per file, named `NNNN-short-title.md`, written from [`template.md`](template.md).

## Rules

- Only **accepted** ADRs are binding (for the owner and for Claude Code).
- An accepted ADR is never edited, except for its status line. To change a decision, write a new ADR and mark the old one `superseded by ADR-NNNN`.
- Rejected ADRs stay in the folder. What was ruled out, and why, is part of the record.
- Designs (domain model, DynamoDB access patterns) go in `docs/phases/`, not here.

## Index

| ADR | Question | Status | Decide by |
| --- | --- | --- | --- |
| 0001 | [Where does data live?](0001-data-storage.md) | proposed | Phase 0 |
| 0002 | [Tenancy and isolation model](0002-tenancy-isolation.md) | proposed | Phase 0 |
| 0003 | [API style](0003-api-style.md) | proposed | Phase 0 |
| 0004 | [Repository and deployment layout](0004-repo-and-deployment-layout.md) | proposed | Phase 0 |
| 0005 | Where CSV files are parsed | not started | Phase 2 |
| 0006 | Event schema versioning | not started | Phase 1 |

Add the file name and a link when an ADR is created. Set the status to `proposed`, `accepted`, `rejected` or `superseded`.

0001 and 0002 are coupled (key design is the isolation design), so write them together.
