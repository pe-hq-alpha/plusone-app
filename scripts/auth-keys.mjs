// Make the key pair the demo's guest tokens are signed with (Convex Auth), and set
// JWT_PRIVATE_KEY and JWKS on the current Convex deployment. Run it once per deployment;
// running it again signs every guest out.
// Usage: node scripts/auth-keys.mjs [--prod] [--dry]
import { execFileSync } from "node:child_process";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const prod = process.argv.includes("--prod");
const dry = process.argv.includes("--dry");

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
const jwks = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }] });

for (const [name, value] of [["JWT_PRIVATE_KEY", privateKey], ["JWKS", jwks]]) {
  if (dry) {
    console.log(`${name}: ${value.length} characters (not set)`);
    continue;
  }
  execFileSync("npx", ["convex", "env", "set", ...(prod ? ["--prod"] : []), name, "--", value], { stdio: "inherit" });
}
