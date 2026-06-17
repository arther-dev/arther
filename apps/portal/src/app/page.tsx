/**
 * The portal root. The portal is per-tenant — published documentation lives at
 * `/{workspace}` (the workspace's portal slug; custom-domain host resolution is
 * a C6 follow-up). This root is a neutral landing.
 */
export default function Home() {
  return (
    <main className="portal-shell">
      <h1 className="portal-title">Arther Portal</h1>
      <p className="portal-empty">
        Published product documentation is served per workspace. Open a workspace’s portal at its
        published address.
      </p>
    </main>
  );
}
