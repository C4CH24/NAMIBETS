Reorganization plan

1. Create `client/` and move frontend files: `index.html`, `src/`, `package.json` scripts will be updated.
2. Create `server/` and move `server.js`, `models/`, `.env`, and server-related deps into a separate `package.json`.
3. Update root-level `package.json` to provide scripts that run client and server concurrently from their folders.

This file is an automated note created by the reorg step.
