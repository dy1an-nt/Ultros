import { NextRequest } from "next/server"
import { Receiver } from "@upstash/qstash"

export type SignatureResult =
  | { ok: true; body: string }
  | { ok: false; status: 401 | 503; error: string }

// Shared QStash webhook verification. Without signing keys the caller must
// refuse to run (503), never fall open: an unsigned job endpoint would let
// anyone burn provider tokens. The signature is bound to the endpoint URL.
export async function verifyQstashSignature(req: NextRequest, path: string): Promise<SignatureResult> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!currentSigningKey || !nextSigningKey) {
    return { ok: false, status: 503, error: "Job queue not configured" }
  }

  const signature = req.headers.get("upstash-signature")
  if (!signature) {
    return { ok: false, status: 401, error: "Missing signature" }
  }

  const body = await req.text()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const receiver = new Receiver({ currentSigningKey, nextSigningKey })
  try {
    const valid = await receiver.verify({
      signature,
      body,
      url: appUrl ? `${appUrl.replace(/\/$/, "")}${path}` : undefined,
    })
    if (!valid) throw new Error("invalid")
  } catch {
    return { ok: false, status: 401, error: "Invalid signature" }
  }

  return { ok: true, body }
}
