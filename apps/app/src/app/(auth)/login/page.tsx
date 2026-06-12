import type { Metadata } from 'next';
import Link from 'next/link';
import { GoogleButton } from '../GoogleButton';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Log in · Arther' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Log in</h1>
      {error === 'link' ? (
        <p className="auth-error">
          That sign-in link was invalid or expired — log in below or request a new one.
        </p>
      ) : null}
      <LoginForm />
      <div className="auth-divider">or</div>
      <GoogleButton />
      <div className="auth-links">
        <Link href="/forgot">Forgot password?</Link>
        <Link href="/signup">Sign up</Link>
      </div>
    </>
  );
}
