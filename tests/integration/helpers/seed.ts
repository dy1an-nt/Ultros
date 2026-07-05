import { prisma } from "@/lib/prisma"

let seq = 0

// Users normally arrive via the Clerk webhook; tests insert the DB row
// directly and sign in with the matching clerkId.
export async function createUser(overrides: { clerkId?: string; username?: string } = {}) {
  seq += 1
  return prisma.user.create({
    data: {
      clerkId: overrides.clerkId ?? `clerk_test_${seq}`,
      username: overrides.username ?? `testuser${seq}`,
    },
  })
}

export async function createPrompt(
  userId: string,
  overrides: { title?: string; deletedAt?: Date; userPrompt?: string } = {}
) {
  return prisma.prompt.create({
    data: {
      userId,
      title: overrides.title ?? "Test prompt",
      tags: [],
      deletedAt: overrides.deletedAt ?? null,
      versions: {
        create: {
          versionNumber: 1,
          systemPrompt: "",
          userPrompt: overrides.userPrompt ?? "Say hi to {{name}}",
        },
      },
    },
    include: { versions: true },
  })
}
