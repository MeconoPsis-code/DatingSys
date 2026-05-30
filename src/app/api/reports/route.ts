import { success } from "@/lib/api-response";

export async function GET() {
  return success({ message: "Reports API — not implemented", module: "reports" });
}
