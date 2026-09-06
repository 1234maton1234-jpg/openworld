# Project workflow

- Communicate with the user in Chinese; use English for tools and code.
- Make targeted changes using patches. Verify confidence of at least 90% before implementation.
- After every terrain, hydrology, or world-layout adjustment, fully reset the local development world and use a new `WORLD_SEED`. Do not preserve frozen terrain regions or legacy layout compatibility in the active development world.
- Before resetting, stop the verified local development server and archive the complete data directory (database, WAL files, uploads) under `work/world-backups/`. Verify absolute paths stay inside this project before moving data. Create a fresh data directory, rebuild, restart, and verify the fresh world. This reset includes development plots and submissions; retain the backup for recovery.
- Do not reset a production instance under this local development instruction.
