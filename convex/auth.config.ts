// Two ways to be signed in: Clerk for accounts, and this deployment's own short-lived
// guest tokens for the demo (Clerk has no anonymous users).
const clerk = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
    ...(clerk ? [{ domain: clerk, applicationID: "convex" }] : []),
  ],
};
