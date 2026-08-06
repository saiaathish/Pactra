import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { getStorageBucket } from "@/lib/firebase/admin";
import { Card, CardTitle } from "@/components/ui/card";
import type { ApprovalManifestDoc } from "@/lib/types";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const db = await getDb();
  const manifest = await db
    .collection<ApprovalManifestDoc>(COLLECTIONS.approvalManifests)
    .findOne({ ownerFirebaseUid: user.uid, analysisRunId: new ObjectId(id) });
  if (!manifest) redirect(`/analysis/${id}`);

  let reportUrl: string | null = null;
  try {
    const [url] = await getStorageBucket()
      .file(manifest.reportStoragePath)
      .getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
    reportUrl = url;
  } catch {
    // Report not written yet — show the manifest data inline.
  }

  const manifestJson = manifest.manifestJson as {
    engineVersion?: string;
    briefSha256?: string;
    videoSha256?: string;
    descriptionSha256?: string;
    tests?: { passed: number; failed: number; uncertain: number; humanReview: number };
    generatedAt?: string;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Approval packet</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Cryptographically bound to the exact brief, video file, and description.
        </p>
      </div>

      <Card>
        <CardTitle>Manifest {manifest.manifestSha256.slice(0, 16)}…</CardTitle>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Engine version" value={manifestJson.engineVersion ?? "—"} mono />
          <Row label="Brief SHA-256" value={manifestJson.briefSha256 ?? manifest.briefSha256} mono />
          <Row label="Video SHA-256" value={manifestJson.videoSha256 ?? manifest.videoSha256} mono />
          <Row label="Description SHA-256" value={manifestJson.descriptionSha256 ?? manifest.descriptionSha256} mono />
          <Row
            label="Tests"
            value={`${manifestJson.tests?.passed ?? 0} passed · ${manifestJson.tests?.failed ?? 0} failed · ${manifestJson.tests?.uncertain ?? 0} uncertain · ${manifestJson.tests?.humanReview ?? 0} human review`}
          />
          <Row label="Generated" value={manifestJson.generatedAt ?? manifest.createdAt.toISOString()} />
        </dl>
        {reportUrl && (
          <a
            href={reportUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Download report (JSON)
          </a>
        )}
      </Card>

      <p className="text-xs text-zinc-600">
        The exact file Pactra tested is the exact file captured by this
        manifest. Any modification invalidates the hash binding.
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={mono ? "font-mono text-xs text-zinc-300 break-all text-right" : "text-zinc-300 text-right"}>
        {value}
      </dd>
    </div>
  );
}
