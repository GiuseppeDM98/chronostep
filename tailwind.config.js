/**
 * Tailwind is bound to the CSS custom properties in src/app/globals.css rather than carrying its
 * own palette. One consequence matters: because the tokens hold complete oklch() colours and not
 * bare channels, the slash-opacity utilities (`bg-panel/50`) do not work on them. Reach for a
 * dedicated token instead of fading one — a faded ink is how unreadable text gets shipped.
 *
 * There is deliberately no `text-faint`. `ink-muted` is the lightest colour text may use, and it
 * clears WCAG AA in both themes; anything lighter is a rule, not a word.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        panel: "var(--panel)",
        sunken: "var(--sunken)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        good: "var(--good)",
        "good-field": "var(--good-field)",
        warn: "var(--warn)",
        "warn-field": "var(--warn-field)",
        bad: "var(--bad)",
        "bad-field": "var(--bad-field)",
        "inverse-ground": "var(--inverse-ground)",
        "inverse-ink": "var(--inverse-ink)",
        focus: "var(--focus)",
      },
      borderColor: {
        DEFAULT: "var(--line)",
      },
      fontFamily: {
        // The human voice: verdicts, prose, notes, descriptions.
        prose: ["var(--font-prose)", "Georgia", "Times New Roman", "serif"],
        // The instrument: every duration, count, date, status code and control label.
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // A short, obvious scale. The verdict is the only thing allowed above 2rem.
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.08em" }],
        tiny: ["0.75rem", { lineHeight: "1.1rem" }],
        small: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.55rem" }],
        prose: ["1.0625rem", { lineHeight: "1.7rem" }],
        lead: ["1.25rem", { lineHeight: "1.75rem" }],
        title: ["1.5rem", { lineHeight: "1.9rem", letterSpacing: "-0.011em" }],
        verdict: ["2.125rem", { lineHeight: "2.5rem", letterSpacing: "-0.021em" }],
        "verdict-lg": ["2.75rem", { lineHeight: "3.1rem", letterSpacing: "-0.024em" }],
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
      },
      maxWidth: {
        // 65–75ch for the verdict paragraph, the only real body copy in the app.
        measure: "68ch",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
