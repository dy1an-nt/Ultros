import { getAvailableModels } from "@/lib/ai/models"
import { jsonOk } from "@/lib/api/errors"

export function GET() {
  return jsonOk(getAvailableModels())
}
