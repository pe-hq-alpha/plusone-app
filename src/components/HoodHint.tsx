import { Cpu } from "lucide-react";
import { openHood } from "../lib/hood";

/**
 * On the demo only, a pointer for judges to the models behind what they just saw. Real
 * events never show it: the app describes outcomes, and the panel is there for the curious.
 */
export function HoodHint({ demo, className = "" }: { demo: boolean; className?: string }) {
  if (!demo) return null;
  return (
    <button type="button" onClick={openHood} className={`inline-flex items-center gap-1.5 text-xs text-accent underline-offset-4 hover:underline ${className}`}>
      <Cpu size={13} strokeWidth={1.6} aria-hidden="true" />
      See the Meta models behind this
    </button>
  );
}
