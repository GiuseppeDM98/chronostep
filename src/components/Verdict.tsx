/**
 * The verdict block: the first thing on every screen.
 *
 * A dateline, one sentence stating how things stand, and a paragraph that backs it with figures.
 * The signature detail is the full stop: the sentence is set in the ink colour and only its final
 * period takes the judgement colour, so the page announces its own reading without a badge, a
 * banner, or a coloured heading.
 *
 * Figures live INSIDE the sentence, set in the mono face. That is the whole argument of this
 * design: a number in a paragraph is a number in context, and it is why no screen here also draws
 * that number as a tile.
 */
import type { ReactNode } from "react";
import type { Run, Sentiment, Verdict as VerdictModel } from "../lib/verdicts";

const STOP_TONE: Record<Sentiment, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-ink-muted",
};

const FIGURE_TONE: Record<Sentiment, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-ink",
};

const RunSpan = ({ run }: { run: Run }) => {
  if (run.kind === "text") return <>{run.text}</>;
  // Prose that carries judgement stays in the prose face and takes only the colour. Setting a word
  // like "oggi" in the mono face would be monospace as costume.
  if (run.kind === "emphasis") {
    return (
      <span className={`font-medium ${FIGURE_TONE[run.sentiment ?? "neutral"]}`}>{run.text}</span>
    );
  }
  return (
    <span
      data-numeric
      className={`font-mono text-[0.92em] font-medium ${FIGURE_TONE[run.sentiment ?? "neutral"]}`}
    >
      {run.text}
    </span>
  );
};

type VerdictProps = {
  verdict: VerdictModel;
  /** The line above the sentence: a greeting, a period, a filter. Content, not a label. */
  dateline?: ReactNode;
  /**
   * The verdict is the page's `<h1>` by default, because on most screens it is what the page is
   * about. Pass "p" where something else already names the page — the task screen's `<h1>` is the
   * task's own title, and two `<h1>`s would leave a screen reader with no page name at all.
   */
  headingAs?: "h1" | "p";
  /** Rendered under the paragraph — the running session, a primary action. */
  children?: ReactNode;
  size?: "regular" | "large";
};

const Verdict = ({
  verdict,
  dateline,
  headingAs = "h1",
  children,
  size = "regular",
}: VerdictProps) => {
  // Split the trailing period so it alone can carry the judgement colour.
  const endsWithStop = verdict.headline.endsWith(".");
  const body = endsWithStop ? verdict.headline.slice(0, -1) : verdict.headline;
  const Heading = headingAs;

  return (
    <section className="border-b border-line pb-8">
      {dateline ? <div className="font-mono text-tiny text-ink-muted">{dateline}</div> : null}

      <Heading
        className={`mt-3 max-w-measure font-prose font-semibold text-ink ${
          size === "large" ? "text-verdict sm:text-verdict-lg" : "text-verdict"
        }`}
      >
        {body}
        {endsWithStop ? (
          <span aria-hidden="true" className={STOP_TONE[verdict.sentiment]}>
            .
          </span>
        ) : null}
      </Heading>

      {verdict.detail.length > 0 ? (
        <p className="mt-4 max-w-measure font-prose text-prose text-ink-muted">
          {verdict.detail.map((run, index) => (
            <RunSpan key={index} run={run} />
          ))}
        </p>
      ) : null}

      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
};

export default Verdict;
