import type { Metadata } from 'next';
import Link from 'next/link';
import { GoogleButton } from '../GoogleButton';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'Sign up · Arther' };

export default function SignupPage() {
  return (
    <>
      <h1>Create your account</h1>
      <SignupForm />
      <div className="auth-divider">or</div>
      <GoogleButton />
      <div className="auth-links">
        <span />
        <Link href="/login">Log in</Link>
      </div>
      <p className="auth-footnote">
        By signing up you agree to the <Link href="/terms">Terms of Service</Link> and{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </>
  );
}
