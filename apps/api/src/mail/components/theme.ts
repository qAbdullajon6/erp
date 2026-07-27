/// Design tokens for HTML emails. Values are plain hex, never CSS variables
/// or oklch() — mail clients (Outlook, most webmail) do not evaluate CSS
/// custom properties or modern color functions, so every color a template
/// uses must already be a literal, computed value.
///
/// These hex values are not eyeballed: they are the FlowERP brand's real
/// oklch() tokens (apps/web/src/styles.css `--brand`, `--brand-glow`, the
/// LogoMark gradient) converted through the exact OKLCH->sRGB reference
/// algorithm, then adjusted only where the source token targets a dark UI
/// (the product is dark-mode-only) and a light, white-card email needs a
/// different point on the same hue to hit WCAG AA contrast. Every text/
/// background pairing below is verified >= 4.5:1 (button included — see the
/// brandButton comment).
export const emailTheme = {
  colors: {
    /// Bright brand blue — oklch(0.68 0.17 250) converted to hex. Decorative
    /// use only (logo tile, gradient accents): its contrast against white is
    /// only ~2.9:1, too low for body text or button backgrounds.
    brand: "#319CFC",
    /// Second gradient stop — oklch(0.78 0.14 220), the same hue family the
    /// LogoMark SVG gradient ends on. Decorative use only, same reason as above.
    brandGradientEnd: "#12CBF5",
    /// Same brand hue, darkened (oklch L 0.55 instead of 0.68) until white
    /// text on top clears WCAG AA (verified 4.82:1). This is the button and
    /// link color — `brand` itself is too light to safely carry text/contrast.
    brandDark: "#0073CF",
    /// Light brand-tinted wash for highlighted info blocks. oklch(0.94 0.02 250).
    brandSoft: "#E2EDF8",
    /// Heading text — near-black navy on the brand's own hue (oklch 0.22 0.02 260),
    /// not pure #000, so it still reads as "FlowERP" rather than generic black.
    heading: "#151B24",
    /// Body copy — oklch(0.34 0.018 260). Contrast vs white: 11.75:1.
    body: "#333841",
    /// Secondary/meta text (timestamps, footer) — oklch(0.52 0.015 260).
    /// Contrast vs white: 5.51:1 — still comfortably AA for normal text.
    muted: "#646972",
    /// Card/divider borders — oklch(0.91 0.006 260), a soft neutral line.
    border: "#DFE1E5",
    /// Page background outside the card — oklch(0.97 0.005 260).
    pageBackground: "#F3F5F9",
    cardBackground: "#FFFFFF",
    white: "#FFFFFF",
    success: "#35C177",
    destructive: "#EE343B",
    warning: "#F2A618",
  },
  /// System font stack only — no @font-face/webfont. Most mail clients strip
  /// or never fetch linked fonts, so relying on one would silently fall back
  /// anyway; this stack renders the product's own premium sans-serif family
  /// (San Francisco / Segoe UI / Roboto) natively on every platform instead.
  fontFamily:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'",
  layout: {
    maxWidth: 600,
  },
} as const;

/// Static brand copy shared by every email — not per-deployment config, so
/// it lives here rather than in environment variables.
export const emailBrand = {
  name: "FlowERP",
  legalName: "FlowERP AI",
} as const;

/// Everything a rendered email needs that isn't specific to one message:
/// where the logo is actually hosted and what the "visit our site" link
/// points to. Built once (see SmtpMailService) from real deployment config —
/// never hardcoded per-template — so every template stays correct if the
/// marketing domain ever changes.
export interface EmailBrandingContext {
  /// Public marketing site, e.g. "https://flowerp.uz". Distinct from the
  /// authenticated app's own URL (InvitationConfig.appPublicUrl) — this must
  /// be the marketing site, not the login screen.
  marketingUrl: string;
  /// Absolute, publicly-fetchable logo URL. Mail clients cannot load bundled
  /// app assets — this must already be hosted.
  logoUrl: string;
}

/// Fallback branding for contexts that render a template without going
/// through the real configured MailService — the test-only outbox
/// controller, which reads only `.subject` and never touches `.html`, and
/// unit tests that don't wire up full app config. Matches the real
/// production defaults exactly, so nothing here is fabricated.
export const DEFAULT_EMAIL_BRANDING: EmailBrandingContext = {
  marketingUrl: "https://flowerp.uz",
  logoUrl: "https://flowerp.uz/logo-512.png",
};
