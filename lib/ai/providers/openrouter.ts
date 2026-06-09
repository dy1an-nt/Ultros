import { createOpenAI } from "@ai-sdk/openai"

const client = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  headers: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://ultros.app",
    "X-Title": "Ultros",
  },
})

// OpenRouter only implements the OpenAI chat-completions endpoint; the SDK's
// default model factory targets the Responses API (/responses), which OpenRouter
// does not serve for these models.
export const openrouter = client.chat
