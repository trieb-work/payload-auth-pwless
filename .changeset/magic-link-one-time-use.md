---
"@trieb.work/payload-auth": minor
---

Enforce one-time-use for magic link tokens via JTI tracking. Each magic link JWT now includes a `jti` claim; the verify endpoint checks the sessions collection for an existing session with that JTI before creating a new one, rejecting replay attempts with 401. A unique DB index on `magicLinkTokenId` in the sessions collection provides a last line of defence against concurrent replays.
