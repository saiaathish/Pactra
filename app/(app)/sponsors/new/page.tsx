import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { Card, CardTitle } from "@/components/ui/card";
import { SponsorForm } from "@/components/sponsor-form";

export default async function NewSponsorPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New sponsor</h1>
        <p className="mt-1 text-sm text-zinc-500">
          After creating the sponsor, upload their brief to compile requirements.
        </p>
      </div>
      <Card>
        <CardTitle>Sponsor details</CardTitle>
        <div className="mt-4">
          <SponsorForm redirectTo="/sponsors/[id]" />
        </div>
      </Card>
    </div>
  );
}
