import { useThemeChoice, type ThemeChoice } from "../../lib/theme";
import { Icon, type IconName } from "./Icon";

const OPTIONS: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "Device", icon: "device" },
];

/**
 * Light, dark, or follow the device: three small pills in a row, one pressed. `compact` is the quiet
 * version for page corners: icons only, no outline, faint until hovered.
 */
export function ThemeSwitch({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const [choice, setChoice] = useThemeChoice();
  if (compact) {
    return (
      <div role="group" aria-label="Appearance" className={`inline-flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100 ${className}`}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={choice === o.value}
            aria-label={o.label}
            title={o.label}
            onClick={() => setChoice(o.value)}
            className={`inline-flex size-6 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
              choice === o.value ? "text-accent" : "text-quiet hover:text-ink"
            }`}
          >
            <Icon name={o.icon} size={13} />
          </button>
        ))}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Appearance" className={`inline-flex rounded-full p-0.5 shadow-[inset_0_0_0_1px_var(--color-line)] ${className}`}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={choice === o.value}
          onClick={() => setChoice(o.value)}
          className={`inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-full px-2.5 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            choice === o.value ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
          }`}
        >
          <Icon name={o.icon} size={14} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
