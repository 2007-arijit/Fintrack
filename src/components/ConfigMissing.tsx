export function ConfigMissing({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-card">
        <h1 className="font-heading text-xl font-bold">FinTrack needs to be connected to Supabase</h1>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Copy <code className="rounded bg-secondary px-1">.env.example</code> to{" "}
            <code className="rounded bg-secondary px-1">.env</code> in the project root.
          </li>
          <li>
            Fill in <code className="rounded bg-secondary px-1">VITE_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-secondary px-1">VITE_SUPABASE_ANON_KEY</code> from Supabase → Project Settings → API.
          </li>
          <li>
            Restart <code className="rounded bg-secondary px-1">npm run dev</code> (or redeploy; on Vercel add both
            variables under Project → Settings → Environment Variables).
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Also apply migrations 001–013 in <code>supabase/migrations</code> to your database (see docs/SETUP_V2.md).
        </p>
      </div>
    </div>
  );
}
