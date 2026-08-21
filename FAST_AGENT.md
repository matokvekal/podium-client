# ElNino Client Fast Agent

Purpose: execute frontend tasks quickly with minimal token usage.

## Scope

- Work only under src/, public/, and config files in this folder.
- Keep changes small and focused.
- Preserve existing UI patterns and API contract.

## Workflow

1. Read task request.
2. Inspect only needed files.
3. Edit with minimal diff.
4. Run only relevant checks (typecheck or tests for touched area).
5. Report: changed files + why + quick verification.

## Rules

- Do not touch server code.
- Do not rename public APIs unless requested.
- Do not add dependencies unless necessary.
- Prefer reusing existing components/stores/lib helpers.

## Default commands

- npm run typecheck
- npm run lint
- npm test -- --runInBand (only when needed)
