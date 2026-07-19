import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/site/LegalPage";
import { siteConfig } from "@/lib/site-config";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms of Service — ${siteConfig.name}` },
      { name: "description", content: `The terms that govern use of the ${siteConfig.name} website and product.` },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { name, legalName, contact } = siteConfig;
  return (
    <LegalPage
      title="Terms of Service"
      updated="July 2026"
      intro={`These terms govern your use of the ${name} marketing website and any trial or subscription you start with us.`}
    >
      <LegalSection heading="Using this site">
        <p>
          You may browse this site and submit demo or contact requests for legitimate business purposes.
          You agree not to misuse the site, attempt to disrupt it, or submit false information through our
          forms.
        </p>
      </LegalSection>

      <LegalSection heading="Trials & subscriptions">
        <p>
          Product plans, trial length, and pricing shown on this site are described in good faith and may
          change. The binding terms for a paid subscription are the order form or agreement you sign with
          {" "}
          {legalName}. A free trial carries no obligation to purchase.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          The {name} name, logo, product, and site content are the property of {legalName}. Nothing here
          grants you a licence to use them except as needed to evaluate the product.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimer & liability">
        <p>
          This site is provided “as is” without warranties of any kind. To the extent permitted by law,
          {" "}
          {legalName} is not liable for indirect or consequential damages arising from your use of the
          site.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms? Email <a href={contact.emailHref}>{contact.email}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
