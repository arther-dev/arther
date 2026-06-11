import type { Metadata } from 'next';
import Link from 'next/link';
import { GoogleButton } from '../GoogleButton';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Log in · Arther' };

export default function LoginPage() {
  return (
    <>
      <h1>Log in</h1>
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
