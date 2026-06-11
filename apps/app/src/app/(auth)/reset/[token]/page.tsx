import type { Metadata } from 'next';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'Reset password · Arther' };

export default function ResetPage() {
  return (
    <>
      <h1>Reset password</h1>
      <ResetForm />
      <p className="auth-footnote">Reset links expire after one hour.</p>
    </>
  );
}
