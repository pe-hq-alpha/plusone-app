import { Link } from "react-router-dom";
import { BRAND } from "../lib/brand";
import { setConsent } from "../lib/analytics/consent";

/**
 * Asks once whether usage analytics may run. Nothing is sent until "Allow";
 * the choice can be changed on the Privacy page.
 */
export function ConsentBar() {
  return (
    <div
      role="region"
      aria-label="Cookie choice"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-line bg-cream px-3.5 py-2.5 text-xs shadow-[0_18px_40px_-20px_rgb(var(--shadow-rgb)/0.5)] sm:right-auto sm:max-w-md"
    >
      {/* Small and in a corner, so the page under it can still be read and used before anyone chooses. */}
      <p className="min-w-0 flex-1 basis-56 text-muted">
        One essential cookie keeps {BRAND.name} secure. May we also count how the app is used, never what you write?{" "}
        <Link to="/privacy#cookies" className="text-accent underline underline-offset-2">Privacy</Link>
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" className="btn-quiet btn-sm" onClick={() => setConsent("essential")}>Essential only</button>
        <button type="button" className="btn-primary btn-sm" onClick={() => setConsent("analytics")}>Allow</button>
      </div>
    </div>
  );
}
