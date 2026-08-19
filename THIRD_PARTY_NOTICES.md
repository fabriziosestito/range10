# Third-Party Notices

range10 incorporates the following third-party works. Exact resolved versions
are recorded in `package-lock.json` and `Cargo.lock`.

## Fonts

No third-party font files are bundled. The UI uses the platform system fonts
(Segoe UI on Windows, SF Pro via `-apple-system` on Apple platforms) and the
system monospace stack.

## Icons

- Fluent UI System Icons (`@fluentui/react-icons`): Copyright (c) 2020
  Microsoft Corporation, licensed under [MIT](third-party/licenses/MIT.txt).

## Software

- React: Copyright (c) Meta Platforms, Inc. and affiliates.
- Fluent UI React v9 (`@fluentui/react-components`, including Griffel, tabster,
  and keyborg): Copyright (c) Microsoft Corporation, licensed under
  [MIT](third-party/licenses/MIT.txt).
- dnd kit (`@dnd-kit/*`): Copyright (c) 2021 Claudéric Demers, licensed under
  [MIT](third-party/licenses/MIT.txt).
- Tauri: Copyright (c) 2017-present Tauri Apps Contributors.
- clsx: Copyright (c) Luke Edwards.
- tauri-plugin-tts: Copyright (c) 2025 Affex Team.
- tenover: Copyright (c) 2026 Eric Thill.
- libgolf (flight model): Copyright (c) gdifiore, licensed under
  [GPL-3.0-only](third-party/licenses/GPL-3.0.txt). The Rust port lives in
  `crate/libgolf-rs/` (LICENSE and attribution in `crate/libgolf-rs/src/lib.rs`);
  the in-air physics is based on Prof. Alan M. Nathan's trajectory model
  (University of Illinois).

These packages and their transitive dependencies retain their respective
permissive licenses. Common license texts are available under
`third-party/licenses/`, including [MIT](third-party/licenses/MIT.txt),
[ISC](third-party/licenses/ISC.txt), and
[Apache-2.0](third-party/licenses/Apache-2.0.txt). Complete package-specific
license metadata and notices remain available from each upstream source
package.
