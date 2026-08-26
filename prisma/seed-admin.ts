import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { Role } from "@prisma/client";

const ADMIN_EMAIL = "admin@stockmoney.com";
const ADMIN_PASSWORD = "admin123";

async function main() {
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: "Shemsi",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: Role.ADMIN,
      isActive: true,
      shopId: null,
    },
    create: {
      email: ADMIN_EMAIL,
      name: "Shemsi",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: Role.ADMIN,
    },
  });

  console.log("");
  console.log("Admin account created:");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
