import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { BudgetBanner } from "@/components/usage/BudgetBanner"

const navItems = [
  { label: "Dashboard", href: "/dashboard", enabled: true },
  { label: "Prompts", href: "/prompts", enabled: true },
  { label: "Datasets", href: "/datasets", enabled: true },
  { label: "Rubrics", href: "/rubrics", enabled: true },
  { label: "Experiments", href: "/experiments", enabled: true },
  { label: "Usage", href: "/usage", enabled: true },
  { label: "Settings", href: "/settings", enabled: true },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col fixed top-0 left-0 h-full z-10">
        <div className="p-4 border-b border-gray-800">
          <span className="text-lg font-bold text-white">Ultros</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) =>
            item.enabled ? (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <div key={item.href} className="flex items-center justify-between px-3 py-2 rounded-md">
                <span className="text-sm text-gray-600">{item.label}</span>
                <span className="text-xs text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              </div>
            )
          )}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <UserButton />
        </div>
      </aside>
      <main className="flex-1 ml-56 overflow-auto">
        <BudgetBanner />
        {children}
      </main>
    </div>
  )
}
