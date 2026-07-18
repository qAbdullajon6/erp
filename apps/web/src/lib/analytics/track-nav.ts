/**
 * Shared navigation tracking utility.
 *
 * Centralizes nav click tracking logic to avoid duplication across
 * Navbar and MobileMenu components.
 */

import { analytics } from './index';

/**
 * Track a navigation link click.
 * @param linkText - Display text of the link
 * @param linkUrl - URL or hash the link points to
 */
export function trackNavClick(linkText: string, linkUrl: string): void {
  analytics.track({
    name: 'nav_click',
    params: {
      link_text: linkText,
      link_url: linkUrl,
    },
  });
}
