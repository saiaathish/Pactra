import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { LogoutButton } from "@/components/logout-button";
import { Camera, FileText, LayoutDashboard, Youtube } from "lucide-react";
import type { UserDoc } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/youtube", label: "YouTube", icon: Youtube },
  { href: "/sponsors", label: "Sponsors", icon: FileText },
  { href: "/campaigns", label: "Campaigns", icon: Camera },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const profile = await db
    .collection<UserDoc>(COLLECTIONS.users)
    .findOne({ firebaseUid: user.uid });
  if (!profile?.onboardingComplete) redirect("/onboarding");

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-56 flex-col border-r border-zinc-800 px-3 py-5">
        <Link href="/dashboard" className="flex items-center gap-2 px-3">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span className="text-lg font-semibold tracking-tight">Pactra</span>
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-zinc-800 pt-4">
          <div className="px-3 pb-3 text-xs text-zinc-500">
            <p className="truncate">{user.email}</p>
            <p className="truncate">{profile.displayName ?? ""}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
    </div>
  );
}
