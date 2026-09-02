import prisma from "@/lib/prisma";
import { parseRmbAmount } from "@/lib/china-rmb";

export async function getChinaRmbPersonOrThrow(personId: string) {
  const person = await prisma.chinaRmbPerson.findUnique({
    where: { id: personId },
    include: { credits: true },
  });
  if (!person) throw new Error("Person not found");
  return person;
}

export async function getChinaRmbCreditOrThrow(creditId: string) {
  const credit = await prisma.chinaRmbCredit.findUnique({
    where: { id: creditId },
    include: { person: { select: { id: true, name: true } } },
  });
  if (!credit) throw new Error("Credit not found");
  return credit;
}

export { parseRmbAmount };
