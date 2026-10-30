import { Link } from "react-router-dom";
import { BRAND } from "../../lib/brand";
import { PlusOneLockup } from "../brand/Wordmarks";
import { ThemeFooter } from "./ThemeFooter";

/** A guest link that leads nowhere: what happened, what to do, and the way home. */
export function BadLink({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-center">
      <div className="flex flex-col items-center">
        <Link to="/" aria-label={`${BRAND.name} Events home`}>
          <PlusOneLockup className="text-[1.9rem]" />
        </Link>
        <p className="display mt-10 text-3xl">{title}</p>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <Link to="/" className="btn-ghost mt-6">
          Go to {BRAND.name} Events
        </Link>
        <ThemeFooter className="mt-8" center />
      </div>
    </main>
  );
}
