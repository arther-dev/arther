import type { Metadata } from 'next';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';

export const metadata: Metadata = { title: 'Create workspace · Arther' };

/**
 * First-run for a brand-new account (auth IA §3): name → live slug preview →
 * create_workspace RPC → Dashboard (admin first-run checklist). Default units
 * and time zone follow with workspace Settings (F4.5).
 */
export default function WelcomePage() {
  return (
    <>
      <h1>Create your workspace</h1>
      <p className="auth-subtext">
        One workspace per company — your products, documents, and portal live here.
      </p>
      <CreateWorkspaceForm />
      <p className="auth-footnote">The portal address can’t be changed later.</p>
    </>
  );
}
