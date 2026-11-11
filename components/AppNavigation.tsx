
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/sky", label: "Sky", icon: "✧" },
  { href: "/recommendations", label: "Observe", icon: "◎" },
  { href: "/telescopes", label: "Telescopes", icon: "◉" },
];

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <>
      {navigationItems.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              mobile
                ? `flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors ${
                    active
                      ? "text-sky-300"
                      : "text-slate-400 hover:text-white"
                  }`
                : `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-800 text-sky-300"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
            }
          >
            {mobile && (
              <span aria-hidden="true" className="text-xl leading-none">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function AppNavigation() {
  return (
    <>
      {/* Desktop and tablet navigation */}
      <header className="sticky top-0 z-40 hidden border-b border-slate-800 bg-slate-950 text-white md:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-white"
          >
            AstroLens
          </Link>

          <nav
            aria-label="Main navigation"
            className="flex items-center gap-2"
          >
            <NavigationLinks />
          </nav>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-slate-800 bg-slate-950/95 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.2)] backdrop-blur-sm md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <NavigationLinks mobile />
      </nav>
    </>
  );
}
