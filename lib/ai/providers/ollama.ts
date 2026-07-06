import { createOpenAI } from "@ai-sdk/openai"

const client = createOpenAI({
  baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: "ollama", // Ollama ignores auth; the SDK requires a non-empty key
})

// Ollama only implements the OpenAI chat-completions endpoint; the SDK's
// default model factory targets the Responses API (/responses), which Ollama
// does not serve.
export const ollama = client.chat
