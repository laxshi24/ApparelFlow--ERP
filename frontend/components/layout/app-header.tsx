import { Scissors } from "lucide-react";
import Link from "next/link";
import { requirePageUser } from "@backend/middleware/auth";
import { can, ROLE_HOME, ROLE_LABELS, type Permission } from "@shared/permissions";
import { NavLinks, type NavItem } from "@frontend/components/layout/nav-links";
import { SessionControls } from "@frontend/components/layout/session-controls";

const NAV: (NavItem & { permission: Permission })[] = [
  { href: "/orders", label: "Cutting Orders", permission: "orders:read" },
  { href: "/verification", label: "Verification", permission: "verification:read" },
  { href: "/sewing", label: "Sewing Queue", permission: "sewing:read" },
  { href: "/recipes", label: "Recipes", permission: "recipes:read" },
  { href: "/audit", label: "Audit History", permission: "audit:read" },
];

/** Role-aware navigation. Hiding links is cosmetic; pages and APIs enforce permissions independently. */
export async function AppHeader() {
  const { user } = await requirePageUser();
  const items = NAV.filter((item) => can(user.role, item.permission));

  return (
    <header className="bg-header text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href={ROLE_HOME[user.role]} className="flex items-center gap-2 rounded-md font-bold focus-visible:outline-white">
          <Scissors aria-hidden className="size-5" />
          ApparelFlow
        </Link>
        <nav aria-label="Main" className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:px-0">
          <NavLinks items={items} />
        </nav>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:ml-auto sm:w-auto sm:justify-end lg:ml-0">
          <div className="leading-tight sm:text-right">
            <p className="text-sm font-semibold">{user.fullName}</p>
            <p className="text-xs text-slate-300">{ROLE_LABELS[user.role]}</p>
          </div>
          <SessionControls />
        </div>
      </div>
    </header>
  );
}

export function AppHeaderFallback() {
  return (
    <header className="bg-header text-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 font-bold">
        <Scissors aria-hidden className="size-5" />
        ApparelFlow
      </div>
    </header>
  );
}
