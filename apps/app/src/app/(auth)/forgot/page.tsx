import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'Forgot password · Arther' };

export default function ForgotPage() {
  return (
    <>
      <h1>Forgot password</h1>
      <p className="auth-subtext">Enter your email and we’ll send you a reset link.</p>
      <ForgotForm />
      <div className="auth-links">
        <span />
        <Link href="/login">Back to log in</Link>
      </div>
    </>
  );
}
