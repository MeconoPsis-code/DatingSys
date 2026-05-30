import { success } from "@/lib/api-response";

export async function GET() {
  return success({ message: "Profile API — not implemented", module: "profile" });
}
