import { emailBrand } from "./theme";

/// The FlowERP mark as an <img>. Explicit width/height (not just CSS) matter
/// here specifically because most mail clients block remote images by
/// default — without them the layout would collapse to nothing until the
/// recipient clicks "show images," and the alt text is what they see in the
/// meantime.
export function EmailLogo(options: { logoUrl: string; size?: number }): string {
  const { logoUrl, size = 40 } = options;
  return `<img src="${logoUrl}" width="${size}" height="${size}" alt="${emailBrand.name}" style="display:block;border:0;outline:none;text-decoration:none;border-radius:${Math.round(
    size * 0.28,
  )}px;" />`;
}
