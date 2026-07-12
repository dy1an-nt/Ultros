import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { Analytics } from "@vercel/analytics/next"
import { QueryProvider } from "@/components/providers/QueryProvider"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

const description =
  "AI evaluation and prompt experimentation platform — run prompts across models and datasets, score every output, and catch regressions between versions."

export const metadata: Metadata = {
  // Vercel's build env can carry a stale/localhost NEXT_PUBLIC_APP_URL; the
  // platform-provided production host is authoritative in deploys.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL ?? "https://ultros.vercel.app")
  ),
  title: { default: "Ultros", template: "%s · Ultros" },
  description,
  openGraph: {
    title: "Ultros",
    description,
    siteName: "Ultros",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ultros",
    description,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.className} bg-gray-950 text-gray-100 antialiased`}>
          <QueryProvider>{children}</QueryProvider>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  )
}
