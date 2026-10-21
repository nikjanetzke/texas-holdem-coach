# Poker Coach original deployment artifact — 2026-10-21

This parentless backup commit preserves generated deployment output, not editable application source.

- `dist/`: exact original 46-file static build, checked against both live origins.
- `functions/_middleware.js`: source middleware from the exact source commit; compiled provider-side function bundle was not exported.
- `BACKUP-MANIFEST.json`: source recovery handles, deployment identity, SHA-256 inventory, test/build provenance, verification scope and caveats.
- Editable source: `3d052bd602f1117ead354077ecfac92612dcad21` on branch `backup/live-20261021-poker-source`, annotated tag `backup-poker-live-20261021`.

The clean source rebuild reproduced every original file byte-for-byte. This additional original-build snapshot is retained independently for direct static-file recovery. Hosting settings/secrets, browser data and other infrastructure are outside scope. Creating this backup did not deploy, change DNS, merge or change main.
