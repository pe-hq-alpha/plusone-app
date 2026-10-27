import { ThemeSwitch } from "./ThemeSwitch";

/**
 * The theme switch, small and to the left, at the foot of a page that has no app shell (the shell has it in the
 * account menu). The same switch and stored choice everywhere; never printed.
 */
export function ThemeFooter({ className = "" }: { className?: string }) {
  return (
    <div className={`no-print flex justify-start ${className}`}>
      <ThemeSwitch compact />
    </div>
  );
}
