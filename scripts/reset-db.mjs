// Deletes the local libSQL/SQLite file; the app re-creates and re-seeds it on the next request.
import fs from "node:fs";
import path from "node:path";
const url = process.env.TURSO_DATABASE_URL || "file:data/callboard.db";
if (!url.startsWith("file:")) { console.log("Remote DB: run DELETE FROM history; DELETE FROM jobs; in the Turso shell instead."); process.exit(0); }
const file = path.resolve(url.slice(5));
for (const f of [file, file + "-wal", file + "-shm"]) fs.rmSync(f, { force: true });
console.log("Reset " + file + ". Demo data will be re-seeded on the next page load.");
