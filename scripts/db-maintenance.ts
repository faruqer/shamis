/**
 * Database maintenance for the SQLite file.
 *
 *   npm run db:backup     # timestamped copy in ./backups (safe while the app runs)
 *   npm run db:optimize   # switch on WAL mode, then compact and re-index
 *
 * WAL mode lets reading and writing happen at the same time, which avoids
 * "database is locked" errors when several people use the app together.
 * The setting is stored in the database file, so it only needs running once.
 */
import fs from "fs";
import path from "path";
import prisma from "../src/lib/prisma";

function getDatabaseFile() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) throw new Error(`DATABASE_URL is not a SQLite file: ${url}`);
  const raw = url.slice("file:".length);
  // Prisma resolves relative SQLite paths from the prisma/ folder.
  return path.isAbsolute(raw) ? raw : path.resolve("prisma", raw);
}

async function backup() {
  const source = getDatabaseFile();
  const dir = process.env.BACKUP_DIR ?? path.resolve("backups");
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(dir, `dev-${stamp}.db`);

  // VACUUM INTO writes a consistent copy even while the app is running.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  console.log(`Backed up ${source}`);
  console.log(`        to ${target} (${Math.round(fs.statSync(target).size / 1024)} KB)`);

  const keep = Number(process.env.BACKUP_KEEP ?? 30);
  const old = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("dev-") && name.endsWith(".db"))
    .sort()
    .slice(0, -keep);
  for (const name of old) fs.unlinkSync(path.join(dir, name));
  if (old.length > 0) console.log(`Removed ${old.length} backup(s) older than the last ${keep}.`);
}

async function optimize() {
  const mode = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>(
    "PRAGMA journal_mode=WAL"
  );
  console.log("journal_mode:", mode[0]?.journal_mode ?? "unknown");
  // PRAGMA returns a row, so it has to run as a query.
  await prisma.$queryRawUnsafe("PRAGMA wal_autocheckpoint=1000");
  await prisma.$executeRawUnsafe("VACUUM");
  await prisma.$executeRawUnsafe("ANALYZE");
  console.log("Database compacted and re-indexed.");
}

async function main() {
  const command = process.argv[2];
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  if (command === "backup") return backup();
  if (command === "optimize") return optimize();
  throw new Error("Usage: db-maintenance.ts <backup|optimize>");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
