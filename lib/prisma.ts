import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function parseUrlComponents(url: string) {
  // Split on the last @ to correctly handle @ in passwords
  const withoutProto = url.replace(/^[^:]+:\/\//, "")
  const lastAt = withoutProto.lastIndexOf("@")
  const userInfo = withoutProto.slice(0, lastAt)
  const hostPath = withoutProto.slice(lastAt + 1)

  const colonIdx = userInfo.indexOf(":")
  const user = decodeURIComponent(colonIdx >= 0 ? userInfo.slice(0, colonIdx) : userInfo)

  const [hostPort, ...dbParts] = hostPath.split("/")
  const [host, portStr] = hostPort.includes(":") ? hostPort.split(":") : [hostPort, "5432"]
  const database = dbParts.join("/").split("?")[0] || "postgres"

  return { user, host, port: parseInt(portStr ?? "5432"), database }
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is not set")

  const password = process.env.DB_PASSWORD
  if (!password) throw new Error("DB_PASSWORD is not set")

  const { user, host, port, database } = parseUrlComponents(connectionString)

  const pool = new Pool({ user, password, host, port, database, ssl: { rejectUnauthorized: false } })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
