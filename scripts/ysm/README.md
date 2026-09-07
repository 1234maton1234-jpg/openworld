# Native YSM preview experiment

Run from the repository root:

```powershell
node scripts/ysm-preview.mjs "C:\path\character.ysm" --port 8790
```

Open the printed loopback URL. The page supports texture selection, numeric
animation playback and loading another `.ysm` file. It never converts to GLB,
uploads to the game server or changes the active world. The original model stays
on disk; parsed resources are served in memory to the local preview only.

Requirements: Node.js 22.15+ with Zstandard support and JDK 21+ (`java` and
`javac` on PATH). Java sources compile into `work/ysm-classes/`. This is a local
experiment, not a production import endpoint or a browser-only YSM decoder.

Also accepts the GeckoLib `assets` directory layout used by the supplied Touhou
Little Maid pack (`geckolib/maid_model.json`):

```powershell
node scripts/ysm-preview.mjs "F:\path\assets" --model winefox_elf
```

The GeckoLib path does not require Java. Model and texture resources are not
included in this repository; their own licenses still apply.

## Compatibility and verification

- Crypto version 3: upstream checksum, modified XChaCha20, MT19937 and YSM
  Zstandard block decoding. Input limit 12 MB; decoded input/output limit 64 MB;
  parser runs in a bounded, timed JVM process.
- Upstream readers for formats 1–32 are retained. Verified with the supplied
  ATRI format-15 file and a synthetic format-32 encrypted fixture. Other versions
  have not been verified; formats outside that range and other crypto versions
  are rejected.
- Bone hierarchy, baked face geometry and base textures. Numeric animation
  channels support linear/Catmull–Rom sampling and pre/post keyframes.
- Expressions, infinite-duration animations, controllers, particles, audio,
  special materials and Minecraft-specific behavior are not implemented. Only
  animations with supported numeric data are offered. Top-level parts can be
  hidden manually using the visibility controls, because helper/background
  geometry otherwise remains visible without the original controllers.
- No account avatar upload or multiplayer integration yet.

## Local game avatar

Set `DEV_AVATAR_FILE` to a `.ysm` path and optionally `DEV_AVATAR_HIDE` to a
comma-separated list of background/helper bone names in the local `.env`, then
run `npm run build` and `npm run dev`. The game starts the local character in
third person using the native geometry and base texture. Press O to switch view.
Walking, running, sitting and cycling use procedural bone motion; this does not
implement the model's original Molang controllers. The override requires a
loopback address and local SQLite, is rejected in production, and does not modify
the account's saved avatar or world data. Clear `DEV_AVATAR_FILE` to disable it.

```powershell
node --test test/ysm.test.mjs
$env:OPENWORLD_YSM_SAMPLE = 'C:\path\character.ysm'
node --test test/ysm.test.mjs
```

Native-code tests skip when the optional JDK or Node Zstandard support is absent.
The sample-file test skips unless its environment variable is supplied.

## Source provenance

Java algorithms, `RawYsmModel`, and `YSMBinaryDeserializer` come from the
user-provided `OpenYSM-main.zip`, corresponding to
<https://github.com/OpenYSM/OpenYSM> (inspected 2026-09-08).
Their MIT license is retained in [LICENSE](LICENSE).

Changes: replace Netty with a bounded read-only buffer; use numeric animation
file keys; route upstream diagnostics to stderr; represent positive infinite
animation length as unsupported `-1`; add a standalone UTF-8 JSON bridge.
The JavaScript geometry adapter follows the coordinate and UV conventions of
upstream `YSMFolderDeserializer` and `NativeModelRenderer`.

The embedded test fixture contains a synthetic quad authored for this project
and was encrypted using upstream `encryptYsmFile`; it contains no user model.
