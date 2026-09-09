# R2 model storage

Bucket: `mirako-openworld-assets` in Cloudflare account `f3ecb6c04488aa83bdd2e6d845c83799`. Created 2026-09-09; dashboard selected Asia Pacific; Standard storage; public access disabled.

Configure the application environment (local `.env` or Zeabur variables):

```dotenv
ASSET_STORAGE=r2
R2_ENDPOINT=https://f3ecb6c04488aa83bdd2e6d845c83799.r2.cloudflarestorage.com
R2_BUCKET=mirako-openworld-assets
R2_PREFIX=models/
R2_ACCESS_KEY_ID=<bucket-scoped access key>
R2_SECRET_ACCESS_KEY=<secret, never commit>
```

Use an R2 Object Read & Write token restricted to this bucket. Database configuration remains PostgreSQL in production; R2 stores GLB originals, draft/building/avatar/vehicle files and generated LOD manifests/files. `DATA_DIR` is still needed for local development SQLite and local-only files. Local tests default to `ASSET_STORAGE=local`.

Object keys:

```text
models/<model-id>.glb
models/derived/<model-id>/lod0.glb
models/derived/<model-id>/lod1.glb
models/derived/<model-id>/lod2.glb
models/derived/<model-id>/manifest.json
```

Downloads continue through the existing authenticated application routes. The application reads R2 server-side; credentials and R2 object URLs are not sent to clients. This does not configure a public R2 domain or bypass building review permissions. Uploads complete their object write before publishing the database reference. Storage failures reject the upload; they do not silently fall back to local disk. Deletion removes originals and derivatives. Optimizer workers read originals from R2 and commit manifests after all outputs.

## Migration and cutover

Run on the machine/container that has the existing complete `uploads` directory, before switching that instance to R2:

```powershell
node scripts/migrate-assets-r2.mjs --source ./data/uploads
node --env-file=.env scripts/migrate-assets-r2.mjs --source ./data/uploads --execute
```

The first command lists eligible files only. Execution uses the R2 variables regardless of the current `ASSET_STORAGE` value, verifies SHA-256 against a fresh object read, skips matching objects and refuses conflicting keys. Symlinks and unrelated files are not followed/copied. Manifests are migrated last. Source files are never removed.

For production, set `ASSET_STORAGE=r2` and `R2_MIGRATE_ON_START=1` for the cutover deployment. Before opening its HTTP listener, the service migrates and verifies the local uploads directory. Failure prevents startup. A persistent marker scoped to the destination prevents subsequent restarts from resurrecting deleted files; remove the migration flag after verification. This assumes one application instance, with the previous process stopped before migration. Retain the original volume for recovery; switching back to local requires copying any newer R2 uploads back first. Migrating this workstation does not migrate a different Zeabur volume. Do not point development uploads at the production prefix during ordinary testing; use `development/`.

## Verification

`test/asset-storage.test.mjs` covers S3 command behavior, original/LOD persistence and cleanup, repeatable verified migration, conflicting-key protection, startup retry/deletion safety, and HTTP avatar/car/plane/boat/building round trips with private-building access control. Local original and generated LOD uploads have also passed real R2 download/SHA-256 checks using the development prefix.

Production cutover completed 2026-09-09 on Zeabur deployment `6aa10ea1ea9ecb9e577e480a`: 10 source files (43,652,992 bytes) migrated and independently reverified. All 6 database-referenced public model routes matched R2 originals. Avatar LOD0/1/2 and the manifest were generated in R2 and verified through HTTP. Both public domains passed database-backed health checks. The migration flag is now disabled; the original volume remains intact. Existing PostgreSQL and OAuth variables were preserved.
