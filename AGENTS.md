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
