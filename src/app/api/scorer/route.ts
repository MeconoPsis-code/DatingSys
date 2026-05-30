import { success } from "@/lib/api-response";

export async function GET() {
  return success({ message: "Scorer API — not implemented", module: "scorer" });
}
