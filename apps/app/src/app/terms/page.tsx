import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service · Arther',
  description: 'The terms governing your use of Arther.',
};

/**
 * Public Terms of Service page (launch-readiness gate: signup references it). The
 * copy below is a PLACEHOLDER scaffold — replace each section's body with
 * legal-reviewed text before opening to external users. The route + linking are
 * in place so that's a copy swap, not an engineering task.
 */
export default function TermsPage() {
  return (
    <main id="main-content" className="legal-doc">
      <p className="legal-doc__draft" role="note">
        Draft — placeholder copy pending legal review. Replace before public launch.
      </p>
      <h1>Terms of Service</h1>
      <p className="legal-doc__meta">Last updated: [DATE]</p>

      <section>
        <h2>Acceptance</h2>
        <p>
          By creating an account or using Arther you agree to these terms. [Replace with reviewed
          copy.]
        </p>
      </section>
      <section>
        <h2>Your account & content</h2>
        <p>
          You are responsible for your account and the content you create. You retain ownership of
          your content; you grant us the rights needed to host and process it to provide the
          service. [Replace with reviewed copy.]
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          Don’t misuse the service, attempt to breach security, or use it unlawfully. [Replace with
          reviewed copy.]
        </p>
      </section>
      <section>
        <h2>Availability & disclaimers</h2>
        <p>
          The service is provided “as is” without warranties except as required by law. [Replace
          with reviewed copy.]
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Questions about these terms: [legal@arther.io]. [Replace with reviewed copy.]</p>
      </section>

      <p className="legal-doc__meta">
        See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  );
}
