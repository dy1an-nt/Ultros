import { Webhook } from "svix"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { errorResponse, jsonOk } from "@/lib/api/errors"

type ClerkUserEvent = {
  type: string
  data: { id: string; username?: string; image_url?: string }
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    return errorResponse("INTERNAL", "Webhook secret not configured")
  }

  const headerPayload = await headers()
  const svix_id = headerPayload.get("svix-id")
  const svix_timestamp = headerPayload.get("svix-timestamp")
  const svix_signature = headerPayload.get("svix-signature")

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return errorResponse("VALIDATION_ERROR", "Missing svix headers")
  }

  const body = await req.text()
  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: ClerkUserEvent

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkUserEvent
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid signature")
  }

  if (evt.type === "user.created") {
    await prisma.user.upsert({
      where: { clerkId: evt.data.id },
      update: {
        username: evt.data.username ?? null,
        avatarUrl: evt.data.image_url ?? null,
      },
      create: {
        clerkId: evt.data.id,
        username: evt.data.username ?? null,
        avatarUrl: evt.data.image_url ?? null,
      },
    })
  }

  return jsonOk("ok")
}
