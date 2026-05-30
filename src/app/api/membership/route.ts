import { success } from "@/lib/api-response";

export async function GET() {
  return success({ message: "Membership API — not implemented", module: "membership" });
}
