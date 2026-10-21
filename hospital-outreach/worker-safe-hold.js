// Medvika email worker - SAFE HOLD version
// No SMTP connection, no sending, no credentials read.
// Replaces previously public /send-test handler until authenticated campaign backend is ready.
export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/send-test" || path === "/auth-check") {
      return new Response("Test endpoint disabled after successful delivery verification.", {
        status: 410,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
      });
    }
    return new Response("Medvika email service online. Sending disabled.", {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }
};
