import { createOpenAI } from "@ai-sdk/openai"

export const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  headers: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://ultros.app",
    "X-Title": "Ultros",
  },
})
