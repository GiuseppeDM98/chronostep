/**
 * RootLayout — document shell.
 *
 * Holds the two typefaces, the pre-paint theme resolution, and the direction contract that every
 * later edit is audited against.
 */
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Literata, JetBrains_Mono } from "next/font/google";
import { ReactNode } from "react";
import Providers from "./providers";

// The human voice. Literata is drawn for extended screen reading, which is what a verdict
// paragraph is, and it holds its colour at 44px without turning into a magazine masthead.
const literata = Literata({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-prose",
});

// The instrument. Every duration, count, date, status code and control label is set in this face,
// which is what keeps columns of figures comparable down the page.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ChronoStep",
  description: "Diario operativo: task, step annidati e tempo registrato.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#22242a" },
  ],
};

/**
 * Resolves the theme before first paint.
 *
 * Runs blocking in <head> on purpose: reading the stored preference from an effect would paint the
 * system theme first and then swap, and a full-page flash on every load is worse than the few
 * milliseconds this costs. Wrapped in try/catch because a browser with site data blocked throws on
 * localStorage access, and a theme preference is never worth a blank page.
 */
const THEME_BOOTSTRAP = `
try {
  var stored = localStorage.getItem("chronostep.theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
} catch (e) {}
`;

/**
 * The direction contract, emitted as a real HTML comment.
 *
 * It has to survive the production build to be auditable, and a JSX `{/* … *\/}` comment does not:
 * the compiler strips it, so the contract would exist only in source. Rendering it through
 * dangerouslySetInnerHTML on a hidden element is what puts the actual comment node in the shipped
 * markup, where `grep b28bfbe7 .next` can find it.
 */
const DIRECTION_CONTRACT = `<!--
THESIS: Every screen opens with a conclusion and backs it with prose carrying the numbers inside the
sentence. It refuses the KPI-tile dashboard; a figure stated in the paragraph is never also drawn as
a tile.
OWN-WORLD: Cool near-neutral ground, no cards — fields divided by 1px rules. Literata is the human
voice, JetBrains Mono every figure, status and control label. Colour means judgement only: green on
track, amber wants attention, red behind. The primary action is ink, not a hue.
STORY: Giuseppe opens the app, reads in one sentence how he stands, sees only the next decisions with
their cost in minutes, and takes one.
FIRST VIEWPORT: Dateline, then the verdict at 34-44px with its full stop in the judgement colour,
then one paragraph at 68ch with inline mono figures, then today's work as narrated rows carrying
their cost. The running session is an inverted bar with Stop at the right, in the app chrome ABOVE
the dateline rather than below the paragraph: a session outlives the page it was started from, and a
Stop that only existed on one task's screen stranded the timer when that task was deleted.
FORM: "Verdetto" — direction E of five built and presented on the design canvas, pinned by the user,
so it beats the roll. Seed b28bfbe7.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="it" className={`${literata.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
    <head>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
    </head>
    <body className="min-h-screen bg-ground text-ink antialiased">
      <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
