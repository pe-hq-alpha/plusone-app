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
      className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex items-center gap-3 rounded-[12px] border border-line bg-cream py-2 pl-3.5 pr-2 text-xs shadow-[0_18px_40px_-20px_rgb(var(--shadow-rgb)/0.5)] md:bottom-4 md:right-auto md:max-w-xl"
    >
      {/* One line in a corner, above a phone's tab bar, so the page can be read and used before anyone chooses. */}
      <p className="min-w-0 flex-1 text-muted">
        <span className="sm:hidden">Count app usage?</span>
        <span className="max-sm:hidden">Count how {BRAND.name} is used, never what you write?</span>{" "}
        <Link to="/privacy#cookies" className="text-accent underline underline-offset-2">Cookies</Link>
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" className="btn-quiet btn-sm" onClick={() => setConsent("essential")}>No thanks</button>
        <button type="button" className="btn-primary btn-sm" onClick={() => setConsent("analytics")}>Allow</button>
      </div>
    </div>
  );
}
