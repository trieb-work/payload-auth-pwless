# Contributing to @trieb.work/payload-auth

Thanks for your interest in contributing. This document covers everything you
need to know to get a PR merged cleanly.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | `^18.20.2` or `>=20.9.0` |
| pnpm | `^10` or `^11` |

Install dependencies (no postinstall scripts — safe to run anywhere):

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm rebuild   # rebuilds approved native deps (@swc/core, sharp, etc.)
```

---

## Development workflow

```sh
pnpm dev          # start the dev Payload+Next app (in-memory MongoDB, no setup needed)
pnpm typecheck    # TypeScript strict check
pnpm lint         # ESLint
pnpm lint:fix     # ESLint with auto-fix
pnpm format       # Prettier write
pnpm format:check # Prettier check (same as CI)
```

The `dev/` app requires no external database — it spins up an in-memory MongoDB
replica set automatically. To use a real MongoDB instance instead, set
`DATABASE_URL` or `MONGODB_URI` in `dev/.env.local`.

---

## Testing

### Unit + integration tests (Vitest)

```sh
pnpm test:int         # run once
pnpm test:int:watch   # watch mode
pnpm test:int:cov     # with coverage report
```

Unit tests live alongside their source files (`src/**/*.test.ts`).
Integration tests (real Payload + in-memory Mongo) live in
`tests/int/**/*.int.spec.ts`.

### E2E tests (Playwright)

```sh
# Build first (required — Playwright runs against the production Next.js server)
pnpm build && pnpm build:dev

# Run tests
pnpm test:e2e
```

E2E specs live in `tests/e2e/**/*.e2e.spec.ts`. They run against a real
MongoDB and a production Next.js build, so they catch cookie, redirect, and
browser-visible issues that unit tests miss.

### What must be tested

| Change type | Required test |
|---|---|
| New endpoint | `src/endpoints/foo.test.ts` unit test |
| New utility | `src/utilities/bar.test.ts` unit test |
| Cookie / redirect / browser-visible flow | Playwright spec in `tests/e2e/` |
| Bug fix | Regression test that fails before the fix |
| Edit to an untested file | You must add tests for the touched code |

`webauthn.ts` and `onboarding.ts` currently have no tests — any edit to them
requires a corresponding new test file.

---

## Changesets

Every user-facing code change needs a changeset entry. Pure tooling, docs, and
CI-only changes are exempt.

```sh
pnpm changeset
```

The CLI will ask which packages are affected and what bump type to use:

| Bump | When to use |
|---|---|
| `patch` | Bug fix, internal refactor, dep update with no API change |
| `minor` | New opt-in feature, new config option, new endpoint |
| `major` | **Do not use without maintainer sign-off.** If you think a change is breaking, open the PR as `minor`, document the breaking behaviour, and let a maintainer escalate. |

Write a clear one-sentence description in the changeset — explain _what_ changed
and _why_, not just what file was modified.

---

## Branch and PR conventions

### Branch naming

```
feat/<short-description>     # new feature
fix/<short-description>      # bug fix
chore/<short-description>    # tooling, CI, deps, docs
refactor/<short-description> # internal refactor with no behaviour change
```

Examples: `feat/webauthn-discoverable-credentials`, `fix/oauth-state-expiry`,
`chore/upgrade-playwright`

### PR title format

Use [Conventional Commits](https://www.conventionalcommits.org/) style:

```
<type>(<optional scope>): <short summary>
```

Examples:
- `feat(magic-link): add allowUser guard per application context`
- `fix(refresh): reject fingerprint mismatch with 401 instead of 500`
- `chore: upgrade @playwright/test to 1.58`

### PR description must include

1. **What changed** — a short summary of the implementation.
2. **Why** — the motivation or issue being addressed.
3. **Test coverage** — which test files were added or updated.
4. **Changeset** — confirm a changeset was added (or state why it was omitted).
5. **Breaking behaviour** (if any) — describe clearly, even if you bumped `minor`.

---

## CI gates

Two GitHub Actions workflows run on every PR:

| Workflow | Checks |
|---|---|
| **CI** | format, lint, typecheck, unit+integration tests (with coverage), build |
| **E2E** | full Playwright suite against a production Next.js + MongoDB build |

**Both must be green before a PR can be merged.** Do not mark your PR as
ready for review while either workflow is red.

Coverage comments are posted automatically to PRs by the CI workflow.

---

## Logging

Never use `console.log/warn/error/info`. Use the Payload logger instead:

```ts
// In endpoint handlers
payload.logger.info({ userId }, 'Magic link requested')
payload.logger.warn({ err }, 'Rate limit hit')
payload.logger.error({ err }, 'Session creation failed')

// In hooks / collection handlers
req.payload.logger.info({ userId }, 'afterLogin hook fired')
```

Object first, message string second (Pino syntax).

---

## Security rules

- Never bypass or weaken the rate-limiting logic on `magic-link` or `refresh`
  endpoints without a documented justification.
- Never remove the `allowedHostnames` check in the agent-login endpoint.
- Always validate `returnUrl` values as same-origin, path-relative URLs before
  using them in a redirect.
- Do not re-enable Payload's built-in email+password local strategy
  (`disableLocalStrategy` must remain `true`).

---

## Code style

- Follow the existing patterns in the file you are editing.
- TypeScript strict mode is enforced — no `any` casts without a comment.
- Imports must be at the top of every file.
- No emojis in source files.
- Run `pnpm format && pnpm lint:fix` before committing (Husky also runs
  lint-staged automatically on `pre-push`).

---

## Release process

Releases are fully automated via [Changesets](https://github.com/changesets/changesets)
and the `release.yml` workflow. When changesets are merged to `main`, the
workflow opens a "Release PR" that bumps versions and publishes to npm once that
PR is merged. You do not need to trigger a release manually.
