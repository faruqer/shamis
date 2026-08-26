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

console.log("Clearing database (all data removed)...");
run("npx prisma db push --force-reset --accept-data-loss");

console.log("Creating admin account only...");
run("npx tsx prisma/seed-admin.ts");

console.log("Done. Database is empty except for the admin account.");
