import { config } from "dotenv"
import { defineConfig } from "prisma/config"

config({ path: ".env.local" })
config({ path: ".env" })

function parseUrlComponents(url: string) {
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

const directUrl = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? ""
const password = process.env["DB_PASSWORD"] ?? ""
const { user, host, port, database } = parseUrlComponents(directUrl)

// Rebuild a clean URL with the properly-encoded password for Prisma CLI
const cleanUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: cleanUrl,
  },
})
