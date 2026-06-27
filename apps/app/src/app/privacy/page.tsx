import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy · Arther',
  description: 'How Arther collects, uses, and protects your data.',
};

/**
 * Public Privacy Policy page (launch-readiness gate: signup references it). The
 * copy below is a PLACEHOLDER scaffold — replace each section's body with
 * legal-reviewed text before opening to external users. The route, linking, and
 * structure are in place so that's a copy swap, not an engineering task.
 */
export default function PrivacyPage() {
  return (
    <main id="main-content" className="legal-doc">
      <p className="legal-doc__draft" role="note">
        Draft — placeholder copy pending legal review. Replace before public launch.
      </p>
      <h1>Privacy Policy</h1>
      <p className="legal-doc__meta">Last updated: [DATE]</p>

      <section>
        <h2>Who we are</h2>
        <p>
          Arther provides living technical documentation for hardware companies. This policy
          explains what personal data we process and why. [Replace with reviewed copy.]
        </p>
      </section>
      <section>
        <h2>Data we collect</h2>
        <p>
          Account data (name, email), workspace content you create, and product/usage analytics
          needed to operate the service. [Replace with reviewed copy.]
        </p>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>
          To provide and secure the service, generate documentation you request, and improve the
          product. We do not sell personal data. [Replace with reviewed copy.]
        </p>
      </section>
      <section>
        <h2>Sub-processors</h2>
        <p>
          We rely on infrastructure and AI sub-processors (e.g. hosting, database, error
          monitoring, and the AI model provider) to operate Arther. [List + replace.]
        </p>
      </section>
      <section>
        <h2>Your rights & contact</h2>
        <p>
          You can request access, correction, or deletion of your data. Contact us at
          [privacy@arther.io]. [Replace with reviewed copy.]
        </p>
      </section>

      <p className="legal-doc__meta">
        See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </main>
  );
}
