import { execSync } from "child_process";
import path from "path";

const projectRoot = path.resolve(__dirname, "..");

function run(command: string) {
  execSync(command, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
}

console.log("Resetting database...");
run("npx prisma db push --force-reset --accept-data-loss");

console.log("Seeding electronics & building demo data...");
run("npx tsx prisma/seed-full.ts");

console.log("Done. Database is ready with cables, dividers, tools, and building supplies.");
