# Forked runtime dependencies

These local snapshots come from the user's forks. Their source and runtime artifacts are reviewed and versioned with Sweet Spot, rather than fetched from movable branches during installation.

| Package | Fork | Base commit |
| --- | --- | --- |
| electron-trpc | https://github.com/hybridknight/electron-trpc | 9b533d21f7e97f68ec9eaf3aba5d5df4db6f24be |
| castv2 | https://github.com/hybridknight/node-castv2 | 41d589abbf8619ec582e2b2707eb5e3266e7a14a |

MIT licenses are retained in each directory. Changes here have not been pushed back to the forks.

`electron-trpc` adds a sender-validation callback before message parsing, denies subframes, rejects malformed request envelopes, and catches asynchronous dispatch failures. With no callback, only attached window contents are accepted. Sweet Spot supplies a callback that accepts only its local UI entry points and retains the existing player procedure restrictions. Rebuild its committed CommonJS and ESM runtime files with `pnpm deps:build-vendor`. The checked-in declarations include the callback; keep both public declaration locations aligned when changing the API. The old upstream Vite configuration is retained as source history, not used by this build.

`castv2` pins protobufjs 8.8.1, loads its fixed protocol schema synchronously, bounds incoming packet size to 1 MiB, closes malformed messages, and respects an explicit TLS verification option. The default self-signed-device behavior remains for Cast compatibility. This does not implement Cast device authentication; only cast to devices on a trusted local network. The tests cover the new parser's text/binary wire round trips and packet framing, not physical receiver interoperability.

To update either snapshot, obtain an immutable fork revision, compare it with the recorded base, reapply and review local changes, update the provenance fields, rebuild artifacts, refresh the lockfile and run the app tests/build and packaged smoke checks. `file:` dependencies package these directories into the application; preserve the Cast `.proto` file beside its runtime source.
