/**
 * Explains why a login fails: wrong database, missing user, inactive user or wrong password.
 * Can also set a new password.
 *
 *   npm run db:check:login -- admin@stockmoney.com "the-password"
 *   npm run db:check:login -- admin@stockmoney.com --reset "new-password"
 */
import fs from "fs";
import path from "path";
import prisma from "../src/lib/prisma";
import { hashPassword, verifyPassword } from "../src/lib/auth";

async function main() {
  const [emailArg, second, third] = process.argv.slice(2);
  const url = process.env.DATABASE_URL ?? "";
  console.log("DATABASE_URL:", url);

  if (url.startsWith("file:")) {
    const raw = url.slice("file:".length);
    // Prisma resolves relative SQLite paths from the prisma/ folder.
    const resolved = path.isAbsolute(raw) ? raw : path.resolve("prisma", raw);
    const exists = fs.existsSync(resolved);
    console.log("Database file:", resolved);
    console.log("  exists:", exists, exists ? `(${Math.round(fs.statSync(resolved).size / 1024)} KB)` : "");
  }

  const users = await prisma.user.findMany({
    select: { email: true, role: true, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const [sales, imports] = await Promise.all([prisma.sale.count(), prisma.import.count()]);
  console.log(`\nThis database has ${users.length} users, ${imports} imports, ${sales} sales.`);
  for (const user of users) {
    console.log(`  ${JSON.stringify(user.email)}  ${user.role}  ${user.isActive ? "active" : "INACTIVE"}`);
  }
  if (users.length === 0 || imports === 0) {
    console.log("\n>> This looks like an EMPTY database. The app is not using your backup file.");
    console.log(">> Set DATABASE_URL in .env to the absolute path of the backup, then pm2 restart.");
  }

  if (!emailArg) return;

  const email = emailArg.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  console.log(`\nChecking ${email}:`);
  if (!user) {
    console.log("  NOT FOUND in this database.");
    return;
  }
  if (!user.isActive) console.log("  User is INACTIVE (login is blocked).");

  if (second === "--reset" && third) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(third), isActive: true },
    });
    console.log("  Password reset and user activated. Try logging in now.");
    return;
  }

  if (second) {
    const ok = await verifyPassword(second, user.passwordHash);
    console.log(ok ? "  Password is CORRECT." : "  Password is WRONG for this database.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
