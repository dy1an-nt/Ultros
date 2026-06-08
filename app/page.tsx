import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function HomePage() {
  const { userId } = await auth()
  if (userId) redirect("/dashboard")

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold text-white mb-4">Ultros</h1>
        <p className="text-xl text-gray-400 mb-8">
          AI evaluation and prompt experimentation platform. Test prompts against
          multiple models, score outputs automatically, and catch regressions before
          they ship.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/sign-up"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/sign-in"
            className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  )
}
