/**
 * F0.4 acceptance probe (PROVISIONING.md): fire a server-side Sentry test
 * error on demand. /sentry-check renders instructions; /sentry-check?go=1
 * throws, which `onRequestError` (instrumentation.ts) reports to Sentry.
 * Harmless to keep around: it only throws when explicitly asked.
 */
export const dynamic = 'force-dynamic';

export default async function SentryCheck({
  searchParams,
}: {
  searchParams: Promise<{ go?: string }>;
}) {
  const { go } = await searchParams;
  if (go === '1') {
    throw new Error('F0.4 acceptance: intentional server-side Sentry test error');
  }
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-10">
      <h1 style={{ font: 'var(--type-h1)' }}>Sentry check</h1>
      <p className="text-secondary">
        Append <code>?go=1</code> to throw a server-side test error and confirm it reaches Sentry
        with readable stack frames (F0.4 acceptance).
      </p>
    </main>
  );
}
