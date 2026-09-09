# Model resource validation

All production GLB uploads (web buildings and CLI buildings, avatars, cars, planes and boats) use `server/validate.mjs`. Shared resource limits are defined in `shared/model-resource-rules.mjs` and exposed through existing world/context rules. Existing published assets are not rewritten.

Model storage is selected with `ASSET_STORAGE=local|r2`. Both originals and derivatives use the same backend. See [R2 configuration and migration](r2-storage.md) before switching an existing instance; a new empty bucket alone does not migrate stored models.

| Resource | Limit |
| --- | --- |
| GLB file | 12 MiB |
| Rendered triangles / vertices | 100,000 / 300,000 |
| Draw primitives / nodes | 200 / 512 |
| Materials / textures | 64 / 16 |
| Texture dimensions / total pixels | 2048 per axis / 16,777,216 |
| Decoded accessor data, including sparse data and animation | 32 MiB |
| Animation clips | 32 |
| Avatar skins / joints per skin | 4 / 128 |

Resource metadata has a versioned `resources` object: category, material and animation counts, rendered and unique vertex counts, nodes, skins, joints, decoded accessor bytes, texture count and pixels. `textureGpuBytesEstimate` assumes RGBA8 with a full mip chain. It is a planning estimate, not a measured GPU allocation or total runtime memory; textures reused in multiple color spaces can consume additional memory. Draw counts and rendered vertices include scene instances. Declared resources are checked before the GLB is decoded in the validation worker.

Type-specific validation remains separate: avatars require skinning and supported animation clips; buildings use plot boundaries and building-motion checks; vehicles use category dimensions and seat declarations. Static buildings and vehicles do not require avatar skeletons. Existing model IDs and stored metrics remain compatible; older models may not have resource metadata.

## Derivatives and delivery

`server/model-optimizer.mjs` produces three independently validated standard GLB visual derivatives in a bounded worker: original-detail with recompressed textures, a 50% simplification target with 1024 px textures, and a 20% target with 512 px textures. Error thresholds and locked mesh borders can prevent the target ratio being reached. Original files are not modified. Node hierarchy, extras, skin bindings and animation channels are checked for preservation.

Existing authorized model routes support `?manifest=1` and `?lod=0|1|2`. A manifest request starts deduplicated optimization when needed; it returns 202 while processing. The global optimizer allows two active workers and eight queued tasks. Completed manifests are persisted after all derivative files. Missing derivatives fall back to originals without immutable caching. Published buildings and current public avatar/vehicle IDs use immutable cache headers; private building assets remain private and pass the same ownership checks as originals. No external CDN service is configured by this change.

`src/model-cache.mjs` deduplicates client downloads, limits network concurrency to two and retains at most 48 MiB of least-recently-used GLB bytes. Streaming downloads are stopped at 24 MiB, with a 20 second timeout. Cancellable subscribers share a request; cancellation aborts the underlying request only when no subscriber remains. Queued cancelled work does not download. LOD removal cancels its manifest/download and disposes any already-parsed late result. Building, avatar and personal/remote vehicle loading now use this cache. GPU objects are still independent per instance.

`src/model-lod.mjs` manages visual geometry and texture swaps without replacing mesh objects, materials, skeletons or original building collision data. Distance to transformed model bounds has hysteresis (50/35 m and 125/100 m); this reduces repeated toggling but is not a visual crossfade. Local avatar/vehicle, then onscreen and nearby instances receive priority within 1.2 million triangles, 256 MiB estimated textures and 1600 draws. Offscreen models do not start derivative downloads. Over-budget instances request lowest detail, then hide if they still exceed the budget. These budgets cover tracked UGC, not terrain or the entire renderer. Original CPU geometry is retained for restoration/collision; replaced derivative GPU resources are disposed. Late derivatives for removed instances are also disposed.

Corrupt/missing derivative files invalidate the stored manifest and fall back to original downloads without immutable caching. Optimization failures have a one-minute backoff and return a failed status, retaining originals. The review page displays progress, ready LOD counts/far triangle count, or fallback status alongside resource estimates.

Regression tests cover shared cancellation, queued cancellation, animated GLB LOD round trips, original collision, reparented vehicle wheels, four-seat declarations, clipping-material restoration, bounds/visibility priorities, private derivative authorization, corrupt derivative rebuilding and failed optimization backoff. The isolated browser harness confirmed all three levels and restoration without captured WebGL errors; this is not a full multiplayer-game visual acceptance test.

## Acceptance evidence (2026-09-09)

The full game was exercised on loopback port 8870 against an isolated SQLite/upload copy, with the existing pink avatar, a published example building and the four-seat itasha. Production data and the original local data directory were not modified. Diagnostic UI and scripted key-duration controls exist only under `work/` and are not included in production builds.

| Requirement | Evidence |
| --- | --- |
| Common upload constraints for buildings, avatars and all vehicle categories | Shared limits, validator tests and CLI HTTP end-to-end tests |
| Original-preserving simplification and texture processing | Optimizer tests; all three rigged outputs revalidated; transform, inverse-bind and animation sampler signatures |
| Protected derivatives and cache policy | HTTP owner/other-user/anonymous tests; private no-store and public immutable checks |
| Failure recovery | Corrupt derivative rebuild and optimizer failure/backoff tests |
| Distance LOD in the real game | Overview zoom and travel exercised LOD 1/2; two far UGC models reported 9,300 triangles and 2 MiB estimated textures, and approaching requested higher detail |
| Unloading | In-game personal vehicle recall removed its tracked resource cost; cancellation and late-disposal regression tests |
| Character/vehicle/building compatibility | Rigged vertex motion across repeated LOD 0/1/2 switches; four-seat and wheel-pivot tests; vehicle clipping-material restoration; original building collision and interaction identity tests |
| Aggregate budgets and loading bounds | Budget priority, offscreen/bounds, shared-request cancellation, queue, concurrency and LRU tests |
| Review information and authoring guidance | Browser review page showed materials/textures, memory estimate and three ready levels; project and installed builder reference updated |
| Regression gate | Build passed; 238 tests: 236 passed, 2 skipped, no failures; diff whitespace check passed |

The full-game diagnostic build also reproduced an existing non-UGC NaN geometry warning. Its creation stack is `unpackCityMeshes → rebuild → worker.onmessage`. This comes from the city mesh path and remains outside this asset-pipeline change; the complete game is not asserted to be free of unrelated rendering defects.

## Operational limits

LOD transitions use bounded simplification error and distance hysteresis, not crossfades; silhouette changes can remain visible on some authored assets. Budgets cover tracked UGC render cost and do not cap total engine or retained decoded CPU memory. Original geometry is retained for collision/restoration. Initial downloads still fetch originals, so this implementation does not promise a lower-detail-only first load or a particular FPS/player-count target. Derivatives are generated on demand; originals remain usable if optimization is unavailable.

Compressed GLB extensions remain unsupported by the upload validator; generated files use existing supported GLB and PNG/JPEG formats. KTX2 or mesh compression requires server and every loader to be upgraded together. The current derivative pipeline provides geometry simplification and image recompression without that extension dependency.
