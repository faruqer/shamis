import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Public health check for PM2 / uptime monitoring. Exposes no data. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "database-unavailable" }, { status: 503 });
  }
}
