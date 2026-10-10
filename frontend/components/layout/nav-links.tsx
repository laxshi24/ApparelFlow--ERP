"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@frontend/components/ui/cn";

export type NavItem = { href: string; label: string };

export function NavLinks({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  return (
    <ul className={cn("flex gap-1", className)}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-white",
                active ? "bg-white text-header" : "text-slate-100 hover:bg-slate-700 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
