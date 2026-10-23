# Git workflow

Use Git Flow for branch naming and integration:

- `main` contains production-ready releases.
- `develop` is the integration branch for upcoming work.
- Create `feature/<short-description>` branches from `develop` and target
  `develop` in their pull requests.
- Create `release/<version>` branches from `develop`; merge completed releases
  into both `main` and `develop`.
- Create `hotfix/<short-description>` branches from `main`; merge completed
  hotfixes into both `main` and `develop`.

Use these prefixes instead of `codex/`. If `develop` does not exist yet, use
`main` as the feature branch base and pull request target until it is established.
Do not create release tags or publish releases without the release-message
confirmation required below.

# Release messages

Before every release, draft a short, user-facing change message and show it to
the user for confirmation. Wait for explicit confirmation of that message
before creating a release tag or publishing the release. A general request to
build or release does not replace confirmation of the actual message.

Focus on 2–3 user benefits, at most 100 words, with no contributor avatars,
commit hashes, test results, or internal build details. Save the confirmed
message to `release-notes/<version>.md`; the release workflow uses this file.
If the message changes after confirmation, show the revised message and obtain
confirmation again. Prepared notes in the repository are drafts until confirmed.
