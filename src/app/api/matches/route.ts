import { success } from "@/lib/api-response";

export async function GET() {
  return success({ message: "Matches API — not implemented", module: "matches" });
}
