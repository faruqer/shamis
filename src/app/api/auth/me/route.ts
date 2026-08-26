import { getSession } from "@/lib/auth";
import { jsonResponse } from "@/lib/api-utils";

export async function GET() {
  const session = await getSession();
  return jsonResponse({ user: session });
}
