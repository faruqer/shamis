/**
 * Creates the admin account, or resets its password if it already exists.
 *
 * Override the defaults with environment variables — on a production server the weak
 * built-in password is refused, because running this script would otherwise silently
 * reset a live admin account back to a publicly documented password:
 *
 *   ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD=<strong> npm run db:seed:admin
 */
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { Role } from "@prisma/client";

const DEFAULT_PASSWORD = "admin123";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@stockmoney.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Shemsi";

async function main() {
  if (process.env.NODE_ENV === "production" && ADMIN_PASSWORD === DEFAULT_PASSWORD) {
    throw new Error(
      "Refusing to seed the admin account with the default password in production.\n" +
        "Re-run with ADMIN_PASSWORD set to a strong value."
    );
  }
  if (ADMIN_PASSWORD.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { name: ADMIN_NAME, passwordHash, role: Role.ADMIN, isActive: true, shopId: null },
    create: { email: ADMIN_EMAIL, name: ADMIN_NAME, passwordHash, role: Role.ADMIN },
  });

  console.log("");
  console.log(existing ? "Admin account updated (password reset):" : "Admin account created:");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  // Only echo the password when it is the throwaway default; a real one shouldn't hit the logs.
  console.log(
    `  Password: ${ADMIN_PASSWORD === DEFAULT_PASSWORD ? ADMIN_PASSWORD : "(as supplied in ADMIN_PASSWORD)"}`
  );
  console.log("");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
