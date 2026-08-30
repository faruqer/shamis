import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@stockmoney.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: "Admin",
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: Role.ADMIN,
      isActive: true,
      shopId: null,
    },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: Role.ADMIN,
    },
  });

  console.log(`Admin ready: ${ADMIN_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
