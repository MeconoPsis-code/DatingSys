import { success } from "@/lib/api-response";

export async function GET() {
  return success({ message: "Rating API — not implemented", module: "rating" });
}
