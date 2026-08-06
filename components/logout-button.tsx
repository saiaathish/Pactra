"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

/** Signs out of Firebase and clears the server session cookie. */
export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    await signOut(getFirebaseAuth()).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={handleLogout}>
      Log out
    </Button>
  );
}
