import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { Analytics } from "@vercel/analytics/next"
import { QueryProvider } from "@/components/providers/QueryProvider"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Ultros",
  description: "AI evaluation and prompt experimentation platform",
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
