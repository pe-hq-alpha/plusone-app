import { Link } from "react-router-dom";
import { BRAND } from "../lib/brand";
import { setConsent } from "../lib/analytics/consent";

/**
 * Asks once whether usage analytics may run. Nothing is sent until "Allow analytics";
 * the choice can be changed on the Privacy page.
 */
export function ConsentBar() {
  return (
    <div
      role="region"
      aria-label="Cookie choice"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg rounded-[14px] border border-line bg-cream px-4 py-3 text-sm shadow-[0_18px_40px_-20px_rgb(var(--shadow-rgb)/0.5)]"
    >
      <p className="text-ink">
        {BRAND.name} uses one essential cookie to keep the site secure. With your OK, we also count how the app is used,
        never what you write. <Link to="/privacy#cookies" className="text-accent underline underline-offset-2">Privacy</Link>
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-quiet btn-sm" onClick={() => setConsent("essential")}>Essential only</button>
        <button type="button" className="btn-primary btn-sm" onClick={() => setConsent("analytics")}>Allow analytics</button>
      </div>
    </div>
  );
}
