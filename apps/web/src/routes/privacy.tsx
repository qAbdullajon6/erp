import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/site/LegalPage";
import { siteConfig } from "@/lib/site-config";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy — ${siteConfig.name}` },
      { name: "description", content: `How ${siteConfig.name} collects, uses, and protects your data.` },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { name, legalName, contact } = siteConfig;
  return (
    <LegalPage
      title="Privacy Policy"
      updated="July 2026"
      intro={`This policy explains what information ${name} collects from visitors to our marketing site, how we use it, and the choices you have.`}
    >
      <LegalSection heading="Information we collect">
        <p>We collect only what we need to respond to you and improve the site:</p>
        <ul>
          <li>
            <strong>Demo &amp; contact requests.</strong> The name, work email, company, phone number,
            and any message you submit through our forms.
          </li>
          <li>
            <strong>Marketing attribution.</strong> UTM parameters, the referring site, and the page you
            landed on, so we understand which campaigns work.
          </li>
          <li>
            <strong>Usage analytics.</strong> Aggregated, device-level information (pages viewed, clicks,
            scroll depth) collected via the tools listed below — only after you consent.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Cookies & analytics">
        <p>
          With your consent we use Google Analytics 4, Google Tag Manager, Microsoft Clarity, and
          advertising pixels (Meta, LinkedIn) to measure traffic and campaign performance. Until you
          accept, these tools stay disabled under Google Consent Mode. You can change your choice at any
          time by clearing this site&apos;s cookies, and we honour your browser&apos;s “Do Not Track”
          signal.
        </p>
      </LegalSection>

      <LegalSection heading="How we use your information">
        <ul>
          <li>To contact you about a demo, trial, or question you raised.</li>
          <li>To understand and improve how the site and product perform.</li>
          <li>To meet legal, security, and fraud-prevention obligations.</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection heading="Data retention & your rights">
        <p>
          We keep demo requests for as long as needed to follow up and for our records. You may request
          access to, correction of, or deletion of your personal data at any time by emailing{" "}
          <a href={contact.emailHref}>{contact.email}</a>.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy? Reach {legalName} at <a href={contact.emailHref}>{contact.email}</a>
          {contact.phoneDisplay ? (
            <>
              {" "}
              or <a href={contact.phoneHref}>{contact.phoneDisplay}</a>
            </>
          ) : null}
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
