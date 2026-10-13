## Mandatory Engineering Workflow

For every feature implementation, bug fix, refactor, or significant code change:

1. Read and follow `.agents/skills/senior-developer/SKILL.md`.
2. Inspect the existing implementation and repository instructions before editing.
3. Define acceptance criteria and evaluate meaningful architectural alternatives.
4. Implement the smallest production-ready solution.
5. Add or update tests and run relevant verification checks.
6. Review the final diff and address regressions introduced by the change.
7. Update `README.md` with the actual implementation, architectural rationale, alternatives considered, trade-offs, and verification results.
8. Report changed files, executed checks, outstanding risks, and anything not verified.

Never fabricate test results or claim deployment, commits, or pushes that did not occur. Preserve unrelated user changes. If a check cannot be completed, disclose the limitation instead of claiming full verification.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
