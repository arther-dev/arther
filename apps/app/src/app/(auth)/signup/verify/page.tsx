import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Check your email · Arther' };

export default function VerifyPage() {
  return (
    <>
      <h1>Check your email</h1>
      <p className="auth-subtext">
        We sent a verification link to your email address. Click it to finish creating your
        account — then come back and log in.
      </p>
      <div className="auth-links">
        <Link href="/signup">Use a different email</Link>
        <Link href="/login">Log in</Link>
      </div>
    </>
  );
}
