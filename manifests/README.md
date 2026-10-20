# Sweet Spot package manifests

Sweet Spot for YouTube Music uses the Windows Package Manager identifier `hybridknight.sweetspot`, executable `sweetspot`, and URI scheme `ssytm`.

Generate Windows Package Manager manifests only after a Sweet Spot release has been packaged and published. Use the new installer URL, its actual SHA-256 checksum, and its actual installer product code. Published installers from earlier releases cannot be relabeled as Sweet Spot: their embedded product identity and registered protocol differ.

The Electron installer configuration lives in [`apps/sweetspot/electron-builder.yml`](../apps/sweetspot/electron-builder.yml).
