# CLPeasy Versioning & Release Process

CLPeasy uses [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **MAJOR** — a breaking change to the public product experience. None has
  happened since launch; v1.0.0 is still the only major line.
- **MINOR** — new, backward-compatible functionality. Example: 1.0.0 →
  1.1.0 added the Print Sheet Composer.
- **PATCH** — a backward-compatible bug fix with no new feature. Example:
  a hypothetical 1.1.0 → 1.1.1 for a single small fix.

## What does NOT bump the version

Research, screenshots, and documentation-only changes that don't alter
product code do not trigger a version increase. Internal-only tooling
(e.g. `scrum.html`, `monitor.html`) is not customer-facing and is not
part of the product version either.

## Single source of truth

The current version lives in exactly one place: `version.js`
(`window.CLPEASY_VERSION`). Every customer-facing display — currently
the "What's new · vX.Y.Z" link in the Builder sidebar, and
`release-notes.html` — reads from that one value. Do not hard-code the
version number anywhere else; if a new page needs to show it, load
`version.js` and read `window.CLPEASY_VERSION`.

## One focused purpose per PR

Each PR should do one thing. Avoid bundling unrelated fixes into a
version-bump PR, so history and rollback stay easy to reason about.

## Merge strategy

Squash-and-merge into `main`. Each PR becomes exactly one commit on
`main`'s history, which keeps rollback (see below) simple.

## Production verification

After merging to `main`, confirm the resulting Netlify production
deploy before treating the release as complete:

1. The deploy's commit hash matches the merge commit.
2. The site loads with no new console errors.
3. A quick visual check of anything the PR touched.

## Rollback

If a release needs to be rolled back, revert the individual squash
commit on `main` (`git revert <sha>`) rather than a wider `reset`. This
keeps history linear and auditable, and avoids discarding unrelated
work that may have landed since.

## Git tags & GitHub Releases

Once a version's PR is merged **and** verified in production:

1. Tag the merged `main` commit: `git tag vX.Y.Z <sha>`.
2. Push the tag.
3. Publish a matching GitHub Release using the same customer-facing
   notes as `release-notes.html` / `CHANGELOG.md`.

Do not create the tag or publish the Release before that PR is merged
and production-verified — both must point at the final, live commit.

## Database migrations

Any release that includes a Supabase schema migration needs extra
care: confirm the migration is backward-compatible with the
currently-deployed code before merging. Netlify deploys and Supabase
migrations are not atomic with each other, so there will be a window
where old code runs against new schema (or vice versa) during rollout.
