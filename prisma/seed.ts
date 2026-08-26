import { prisma } from "../src/lib/prisma";
import { runFullSeed } from "./seed-full";

async function main() {
  await runFullSeed({ includePreview: true });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
