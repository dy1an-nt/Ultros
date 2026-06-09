import { getAvailableModels } from "@/lib/ai/models"

export function GET() {
  return Response.json({ data: getAvailableModels(), error: null })
}
