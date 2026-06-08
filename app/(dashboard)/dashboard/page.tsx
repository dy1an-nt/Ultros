import { currentUser } from "@clerk/nextjs/server"
import Link from "next/link"
import { RecentPrompts } from "@/components/prompts/RecentPrompts"

export default async function DashboardPage() {
  const user = await currentUser()

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
        </h1>
        <p className="text-gray-400 mt-1">Your AI evaluation workspace</p>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Prompts</h2>
          <Link
            href="/prompts/new"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + New Prompt
          </Link>
        </div>
        <RecentPrompts />
      </div>
    </div>
  )
}
