// Test stub for isomorphic-dompurify.
//
// The real package pulls in jsdom (and its ESM-only transitive dep
// @exodus/bytes), which Jest's CommonJS transform cannot load. None of the
// unit test suites assert on DOMPurify's sanitization behavior — they only
// import it transitively through TemplateService — so a lightweight stub keeps
// the heavy jsdom chain out of the test runtime.
//
// The stub performs a minimal, conservative sanitization (strips <script>
// blocks and on* event-handler attributes) so that any test which *did* rely on
// dangerous markup being removed still sees safe output, without loading jsdom.
function sanitize(input) {
  if (input == null) return "";
  return String(input)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

module.exports = { sanitize, default: { sanitize } };
