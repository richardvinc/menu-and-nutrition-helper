# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `CONTEXT-MAP.md` if it exists.
- Relevant ADRs under `docs/adr/`.

If these files do not exist, proceed silently. The domain-modeling skill creates them when terms or decisions are resolved.

## File structure

This repository uses a single-context layout:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

Use terms as defined in `CONTEXT.md`. If a needed concept is absent, reconsider the wording or note the gap for domain modeling.

## Flag ADR conflicts

Explicitly surface output that conflicts with an existing ADR rather than silently overriding it.
