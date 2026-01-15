"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/tasks", label: "Tasks" },
  { href: "/timeline", label: "Timeline" },
  { href: "/insights", label: "Insights" },
];

const TopNav = () => {
  const pathname = usePathname();
  const isActive = (href: string) => {
    // Root needs exact match; other routes accept nested paths.
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-6 pb-3 text-sm">
        {NAV_LINKS.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                active
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default TopNav;
