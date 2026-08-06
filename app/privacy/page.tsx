export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-400">
          <p>
            Pactra stores the data you provide: account information, sponsor
            briefs, video files you upload for analysis, and — when you connect
            a YouTube account — channel metadata and video metadata via the
            official YouTube Data API.
          </p>
          <p>
            Connected YouTube accounts receive a refresh token, stored
            server-side and encrypted (AES-256-GCM). It is used only to keep
            your channel data in sync while you are offline. You can disconnect
            at any time, which revokes access.
          </p>
          <p>
            Video and brief files are stored in private storage and are only
            accessible to you and the analysis worker. We do not sell or share
            your data with third parties.
          </p>
          <p>
            Contact: support@pactra.app for any privacy questions.
          </p>
        </div>
      </div>
    </main>
  );
}
