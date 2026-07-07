# Agent Rules — @trieb.work/payload-auth

This file governs how AI agents (and human contributors acting with agent-like
autonomy) must behave when working in this repository.

---

## Stack at a glance

| Layer | Technology |
|---|---|
| Plugin runtime | TypeScript, Payload CMS 3.x, Next.js 15/16 |
| Unit / integration tests | Vitest (`pnpm test:int`) |
| E2E tests | Playwright / Chromium (`pnpm test:e2e`) |
| Releases | Changesets (`pnpm changeset`) |
| Linting | ESLint + Prettier |
| Package manager | pnpm 10 |

---

## Non-negotiable rules

### 1. Every change must be tested

- **New feature or endpoint** → add a `*.test.ts` unit test in `src/` (vitest).
  If the feature involves cookies, redirects, or browser-visible behaviour, also
  add or extend a Playwright spec in `tests/e2e/`.
- **Bug fix** → add a regression test that fails before the fix and passes after.
- **Change to a currently untested file** → you must add tests for the code you
  touch before the PR can be merged. `webauthn.ts` and `onboarding.ts` are known
  gaps — any edit to them requires adding a corresponding test file.
- **Refactor with no behaviour change** → existing tests must still pass; no test
  deletions without a documented reason.

Unit test location pattern:
- `src/endpoints/foo.ts` → `src/endpoints/foo.test.ts`
- `src/utilities/bar.ts` → `src/utilities/bar.test.ts`
- Top-level plugin changes → `src/plugin.test.ts`

Integration tests (real Payload + in-memory MongoDB) live in
`tests/int/*.int.spec.ts`.

E2E tests live in `tests/e2e/*.e2e.spec.ts`.

### 2. Both CI workflows must pass

The repository has two separate GitHub Actions workflows:

| Workflow | File | What it checks |
|---|---|---|
| CI | `.github/workflows/ci.yml` | format, lint, typecheck, unit+integration tests, build |
| E2E | `.github/workflows/e2e.yml` | full Playwright suite against a production Next.js build |

**Both workflows are hard gates.** A PR must not be merged if either workflow is
red. Do not mark a task as done until you have verified that both pass.

### 3. Every user-facing change requires a changeset

Run `pnpm changeset` and commit the generated file alongside your code changes.
The changeset description must explain **what changed and why** — a single
sentence is fine, a commit hash is not.

Bump type rules:
- `patch` — bug fixes, internal refactors, dependency updates with no API change.
- `minor` — new opt-in features, new config options, new endpoints.
- `major` — **requires explicit maintainer sign-off**. Do not bump major
  unilaterally. If you believe a change is breaking, open the PR as `minor`,
  document the breaking behaviour in the description, and let a maintainer
  escalate the bump.

Pure developer-experience changes (docs, test files, CI config, tooling) do not
need a changeset.

### 4. Logging

Never use `console.log`, `console.warn`, `console.error`, or `console.info`.

| Context | Logger |
|---|---|
| Payload hooks / collection handlers | `req.payload.logger` |
| Route handlers (endpoint files) | initialise `payload` early, then `payload.logger` |

Use Pino object syntax: object first, then message string.
```ts
payload.logger.error({ err }, 'Session creation failed')
payload.logger.info({ userId }, 'Magic link requested')
```

Log levels: `.info()` for normal flows, `.warn()` for expected/recoverable
errors, `.error()` for unexpected failures.

### 5. Security-sensitive code

- Never weaken rate-limiting logic without a documented justification.
- Never bypass the `allowedHostnames` check in the agent-login endpoint.
- `returnUrl` values must always be validated as same-origin path-relative URLs
  before being used in a redirect.
- Keep `disableLocalStrategy: true` — do not re-enable Payload's built-in
  email+password strategy.

### 6. Code style

- Follow the existing patterns in the file you are editing.
- Run `pnpm format` and `pnpm lint:fix` before committing.
- TypeScript strict mode is on — no `any` casts without a comment explaining why.
- Imports must always be at the top of the file.
- No emojis in source files.

---

## Running the test suite locally

```sh
# Unit + integration (vitest, in-memory MongoDB)
pnpm test:int

# E2E (Playwright — requires a built dev app)
pnpm build && pnpm build:dev
pnpm test:e2e

# Full suite (same as CI)
pnpm test

# With coverage
pnpm test:int:cov
```

The dev app starts an in-memory MongoDB replica set automatically — no external
database is required for local testing.

---

## Adding a new auth feature (checklist)

1. Implement the feature under `src/`.
2. Register any new endpoints in `src/plugin.ts` following the existing pattern.
3. Add unit tests (`src/endpoints/your-feature.test.ts` or the relevant utility
   test file).
4. Add an E2E spec in `tests/e2e/` if the feature involves cookies, redirects,
   or a browser-visible flow.
5. Export any new public types from `src/index.ts` (and `src/exports/client.ts`
   for React components).
6. Update `README.md` — the endpoint table and the config option table.
7. Run `pnpm changeset` and write a clear description.
8. Run `pnpm typecheck && pnpm lint && pnpm test:int` — all must be green.
9. Open a PR; both CI and E2E workflows must pass before requesting review.

---

## Repo layout reference

```
src/
  plugin.ts            # main plugin factory
  types.ts             # config types + resolveOptions
  collections/         # Sessions, WebAuthnCredentials
  endpoints/           # one file per auth flow
  fields/              # userFields builder
  hooks/               # afterLogin hook
  utilities/           # tokens, session, rateLimit, …
  exports/client.ts    # public React component exports
  index.ts             # public API surface

tests/
  int/                 # vitest integration tests (real Payload + Mongo)
  e2e/                 # Playwright specs

dev/                   # local dev Payload+Next app (not published)
.changeset/            # pending changesets (committed, not published yet)
```
