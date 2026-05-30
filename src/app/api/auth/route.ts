import { success } from "@/lib/api-response";

export async function GET() {
  return success({ message: "Auth API — not implemented", module: "auth" });
}
