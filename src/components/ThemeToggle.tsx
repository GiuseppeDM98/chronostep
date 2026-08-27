/**
 * Three-state theme control: system, light, dark.
 *
 * A two-state toggle would silently discard "follow the OS", which is the state most people are
 * actually in and the one this app defaults to. The current mode is announced through
 * `aria-checked` on radio semantics rather than through the icon alone.
 */
"use client";

import { useTheme, type ThemePreference } from "../hooks/useTheme";

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: JSX.Element }> = [
  {
    value: "system",
    label: "Segui il sistema",
    icon: (
      <>
        <rect x="2.5" y="3.5" width="11" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <path d="M6 13.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </>
    ),
  },
  {
    value: "light",
    label: "Chiaro",
    icon: (
      <>
        <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    value: "dark",
    label: "Scuro",
    icon: (
      <path
        d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    ),
  },
];

const ThemeToggle = () => {
  const { preference, setPreference } = useTheme();

  return (
    <div role="radiogroup" aria-label="Tema" className="flex items-center border border-line">
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => setPreference(option.value)}
            className={`grid h-8 w-8 place-items-center transition-colors ${
              selected ? "bg-inverse-ground text-inverse-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
              {option.icon}
            </svg>
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
