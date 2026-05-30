import { success } from "@/lib/api-response";

export async function GET() {
  return success({ message: "Admin API — not implemented", module: "admin" });
}
