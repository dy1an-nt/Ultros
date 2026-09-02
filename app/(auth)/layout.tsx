import Link from "next/link"
import { Hanken_Grotesk, Source_Serif_4 } from "next/font/google"
import { UltrosLogo } from "@/components/landing/Logo"

// Auth shell from docs/design/Ultros Sign In.dc.html, same dark-green brand
// surface as the landing page; Clerk renders the form inside it.
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "500", "600"] })

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${sans.className} min-h-screen bg-[#0B0F0D] text-[#ECF1ED] flex flex-col`}>
      <div className="max-w-[1120px] w-full mx-auto px-8 py-7">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <UltrosLogo />
          <span className={`${serif.className} text-[22px] font-semibold tracking-tight`}>Ultros</span>
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 pb-16">{children}</div>
    </div>
  )
}
