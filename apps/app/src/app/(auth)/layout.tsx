/**
 * Unauthenticated chrome (auth IA §2/§5): centered branded auth card on the
 * dark canvas — deliberately OUTSIDE the app shell (no top bar/rail/inspector;
 * there is no workspace context yet). Wordmark placeholder pending the brand
 * asset (script display face).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-canvas">
      <p className="auth-wordmark" aria-hidden="true">
        Arther
      </p>
      <div className="auth-card">{children}</div>
    </div>
  );
}
