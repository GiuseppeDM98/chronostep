/**
 * The verdict engine.
 *
 * Every screen in ChronoStep opens with a sentence that states how things actually stand, then a
 * short paragraph that backs it with figures. This module computes both from the data. Nothing
 * here is written for a screen: the UI renders whatever the rules conclude.
 *
 * Three rules govern the whole file, and they are the difference between a verdict and a slogan.
 *
 * 1. **A verdict must be able to deliver bad news.** Lateness outranks momentum: a user who is
 *    running a timer while three things are overdue is told about the three things. A rule set that
 *    cannot reach an unflattering conclusion is decoration.
 * 2. **A verdict states only what the data supports.** Where the figures are too thin to judge,
 *    the verdict says so (`isSparse`) and the screen offers guidance instead of a reading. A brand
 *    new account and a quiet month are ordinary states here, not edge cases.
 * 3. **A figure stated in the paragraph is never also drawn as a tile.** The paragraph IS the
 *    readout, which is why the runs carry their own judgement colour.
 *
 * Ordering matters: the rules are evaluated top to bottom and the first match wins, so the sequence
 * of the `if`s in each builder is the editorial priority of the screen.
 */
import {
  daysBetweenKeys,
  daysUntilDue,
  formatMinutes,
  instantDayKey,
  instantMonthKey,
  formatMonthKey,
  todayKey,
} from "./dates";
import { buildDailyWorkLogTotals, buildTaskActivity } from "./insights";
import type { Step, Task, WorkLog } from "./types";

export type Sentiment = "good" | "warn" | "bad" | "neutral";

/**
 * One run of the supporting paragraph. `figure` runs are set in the mono face and may carry a
 * judgement colour; everything else is prose in the serif.
 */
export type Run =
  | { kind: "text"; text: string }
  /** A number, a duration, a percentage, a tag: set in the mono face. Never a word. */
  | { kind: "figure"; text: string; sentiment?: Sentiment }
  /** Prose that carries judgement — "oggi", "in ritardo". Serif face, judgement colour. */
  | { kind: "emphasis"; text: string; sentiment?: Sentiment };

export type Verdict = {
  /** One sentence, ending in a full stop. The renderer paints that stop in `sentiment`. */
  headline: string;
  sentiment: Sentiment;
  detail: Run[];
  /** True when the data cannot support a judgement; the screen shows guidance instead. */
  isSparse: boolean;
};

/** A decision the user could take next, with what it costs. */
export type NextDecision = {
  id: string;
  label: string;
  context?: string;
  /** Minutes already spent on it, when any. */
  minutesSpent?: number;
  dueInDays?: number;
  sentiment: Sentiment;
  href: string;
};

const text = (value: string): Run => ({ kind: "text", text: value });
const figure = (value: string, sentiment?: Sentiment): Run => ({
  kind: "figure",
  text: value,
  sentiment,
});
const emphasis = (value: string, sentiment?: Sentiment): Run => ({
  kind: "emphasis",
  text: value,
  sentiment,
});

/** Italian counts: `step` and `task` do not inflect, `giorno` and `cosa` do. */
const count = (value: number, singular: string, plural: string) =>
  `${value} ${value === 1 ? singular : plural}`;

/**
 * A counted quantity as TWO runs: the number in the mono face, the noun in prose.
 *
 * Pushing "5 task aperti" through `figure()` set the whole phrase in monospace, which is the
 * "mono as costume" the craft floor refuses and a contradiction of this design's own rule that the
 * two faces separate the instrument from the human voice.
 */
const countRuns = (
  value: number,
  singular: string,
  plural: string,
  sentiment?: Sentiment,
): Run[] => [figure(String(value), sentiment), text(` ${value === 1 ? singular : plural}`)];

/**
 * How long a session has been running, as prose.
 *
 * A session that has just started rounds to zero minutes, and "stai lavorando da 0m" is both odd
 * Italian and faintly absurd. Under a minute the sentence says so in words instead of printing a
 * figure that means nothing.
 */
const elapsedRuns = (minutes: number): Run[] =>
  minutes < 1
    ? [text("da poco")]
    : [figure(formatMinutes(minutes), "good")];

const dayBefore = (dayKey: string) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
};

/**
 * Average minutes per day over the `days` days before today.
 *
 * Days with no work count as zero on purpose: an average taken only over active days answers "how
 * hard do I go when I go", which is not the question "is today normal for me".
 */
const averageDailyMinutes = (
  totalsByDay: Map<string, number>,
  today: string,
  days: number,
): number => {
  let sum = 0;
  let cursor = today;
  for (let index = 0; index < days; index += 1) {
    cursor = dayBefore(cursor);
    sum += totalsByDay.get(cursor) ?? 0;
  }
  return Math.round(sum / days);
};

// ─── Oggi ────────────────────────────────────────────────────────────────────

export type TodayInput = {
  tasks: Task[];
  steps: Step[];
  workLogs: WorkLog[];
  /** Set when a session is running right now. */
  running?: { taskTitle: string; stepTitle?: string; elapsedMinutes: number };
  now: Date;
};

export type TodayReading = {
  verdict: Verdict;
  overdueTasks: Task[];
  overdueSteps: Step[];
  dueTodayTasks: Task[];
  dueTodaySteps: Step[];
  todayMinutes: number;
  yesterdayMinutes: number;
  averageMinutes: number;
};

export const readToday = (input: TodayInput): TodayReading => {
  const { tasks, steps, workLogs, running, now } = input;
  const today = todayKey(now);

  const activeTasks = tasks.filter((task) => task.status !== "done");
  const activeSteps = steps.filter((step) => step.status !== "done");

  const dueIn = (dueDate?: string) =>
    dueDate ? daysUntilDue(dueDate, now) : undefined;

  const overdueTasks = activeTasks.filter((task) => (dueIn(task.dueDate) ?? 1) < 0);
  const overdueSteps = activeSteps.filter((step) => (dueIn(step.dueDate) ?? 1) < 0);
  const dueTodayTasks = activeTasks.filter((task) => dueIn(task.dueDate) === 0);
  const dueTodaySteps = activeSteps.filter((step) => dueIn(step.dueDate) === 0);

  const { logDurations } = buildTaskActivity(workLogs);
  const totalsByDay = buildDailyWorkLogTotals(workLogs, logDurations);
  const todayMinutes = totalsByDay.get(today) ?? 0;
  const yesterdayMinutes = totalsByDay.get(dayBefore(today)) ?? 0;
  const averageMinutes = averageDailyMinutes(totalsByDay, today, 7);

  const overdueCount = overdueTasks.length + overdueSteps.length;
  const dueCount = dueTodayTasks.length + dueTodaySteps.length;

  const reading = {
    overdueTasks,
    overdueSteps,
    dueTodayTasks,
    dueTodaySteps,
    todayMinutes,
    yesterdayMinutes,
    averageMinutes,
  };

  // Nothing to judge yet.
  if (tasks.length === 0) {
    return {
      ...reading,
      verdict: {
        headline: "Non c'è ancora niente qui.",
        sentiment: "neutral",
        isSparse: true,
        detail: [
          text(
            "Crea il primo task: bastano un titolo e, se serve, una scadenza. Gli step e il tempo si aggiungono dopo, quando servono.",
          ),
        ],
      },
    };
  }

  const detail: Run[] = [];

  if (running) {
    detail.push(text("Stai lavorando "));
    if (running.elapsedMinutes >= 1) detail.push(text("da "));
    detail.push(...elapsedRuns(running.elapsedMinutes));
    detail.push(text(` su ${running.taskTitle}`));
    if (running.stepTitle) detail.push(text(`, ${running.stepTitle}`));
    detail.push(text(". "));
  }

  if (overdueCount > 0) {
    detail.push(text("Hai "));
    detail.push(...countRuns(overdueCount, "cosa scaduta", "cose scadute", "bad"));
    const oldest = [...overdueTasks, ...overdueSteps]
      .map((item) => daysUntilDue(item.dueDate as string, now))
      .sort((a, b) => a - b)[0];
    detail.push(text(", la più vecchia da "));
    detail.push(...countRuns(Math.abs(oldest), "giorno", "giorni", "bad"));
    detail.push(text(". "));
  }

  if (dueCount > 0) {
    detail.push(text("Oggi scadono "));
    detail.push(...countRuns(dueTodayTasks.length, "task", "task", "warn"));
    if (dueTodaySteps.length > 0) {
      detail.push(text(" e "));
      detail.push(...countRuns(dueTodaySteps.length, "step", "step", "warn"));
    }
    detail.push(text(". "));
  }

  // The day's own numbers, and whether today is normal for this person.
  if (todayMinutes > 0) {
    detail.push(text("Oggi hai registrato "));
    detail.push(figure(formatMinutes(todayMinutes)));
    if (averageMinutes > 0) {
      const versus = todayMinutes >= averageMinutes ? "sopra" : "sotto";
      detail.push(text(`, ${versus} la tua media di `));
      detail.push(figure(formatMinutes(averageMinutes)));
    }
    detail.push(text("."));
  } else if (yesterdayMinutes > 0) {
    detail.push(text("Ieri avevi registrato "));
    detail.push(figure(formatMinutes(yesterdayMinutes)));
    detail.push(text("; oggi ancora niente."));
  }

  // Priority order IS the editorial judgement: being late outranks being busy.
  let headline: string;
  let sentiment: Sentiment;
  if (overdueCount > 0) {
    headline =
      overdueCount === 1 ? "Sei in ritardo su una cosa." : `Sei in ritardo su ${overdueCount} cose.`;
    sentiment = "bad";
  } else if (running) {
    headline = "Sei già in pista.";
    sentiment = "good";
  } else if (dueCount > 0) {
    headline =
      dueCount === 1 ? "Oggi scade una cosa." : `Oggi scadono ${dueCount} cose.`;
    sentiment = "warn";
  } else if (activeTasks.length === 0) {
    headline = "Non hai niente di aperto.";
    sentiment = "good";
  } else {
    headline = "Oggi non scade niente.";
    sentiment = "good";
    detail.unshift(
      text("Restano "),
      ...countRuns(activeTasks.length, "task aperto", "task aperti"),
      text(" senza fretta. "),
    );
  }

  return { ...reading, verdict: { headline, sentiment, detail, isSparse: false } };
};

/**
 * The work the user could pick up next, in the order the screen should offer it.
 *
 * Deliberately short and deliberately not "everything": a list of every open item is the thing the
 * verdict exists to replace. Overdue first, then today, then whatever is running.
 */
export type DecisionContext = {
  stepsById: Map<string, Step>;
  tasksById: Map<string, Task>;
  /** Minutes already spent, per task and per step. A decision states what it has cost so far. */
  minutesByTask: Map<string, number>;
  minutesByStep: Map<string, number>;
};

export const nextDecisions = (
  reading: TodayReading,
  context: DecisionContext,
  now: Date,
  limit = 5,
): NextDecision[] => {
  const { stepsById, tasksById, minutesByTask, minutesByStep } = context;
  const decisions: NextDecision[] = [];

  const pushTask = (task: Task, sentiment: Sentiment) => {
    decisions.push({
      id: `task-${task.id}`,
      label: task.title,
      context: task.tags?.length ? task.tags.map((tag) => `#${tag}`).join(" ") : undefined,
      minutesSpent: minutesByTask.get(task.id) ?? 0,
      dueInDays: task.dueDate ? daysUntilDue(task.dueDate, now) : undefined,
      sentiment,
      href: `/tasks/${task.id}`,
    });
  };

  const pushStep = (step: Step, sentiment: Sentiment) => {
    const parent = step.parentStepId ? stepsById.get(step.parentStepId) : undefined;
    const task = tasksById.get(step.taskId);
    decisions.push({
      id: `step-${step.id}`,
      label: step.title,
      context: [parent ? `sotto ${parent.title}` : undefined, task ? task.title : undefined]
        .filter(Boolean)
        .join(" · "),
      minutesSpent: minutesByStep.get(step.id) ?? 0,
      dueInDays: step.dueDate ? daysUntilDue(step.dueDate, now) : undefined,
      sentiment,
      href: `/tasks/${step.taskId}`,
    });
  };

  reading.overdueSteps.forEach((step) => pushStep(step, "bad"));
  reading.overdueTasks.forEach((task) => pushTask(task, "bad"));
  reading.dueTodaySteps.forEach((step) => pushStep(step, "warn"));
  reading.dueTodayTasks.forEach((task) => pushTask(task, "warn"));

  return decisions.slice(0, limit);
};

// ─── Dettaglio task ──────────────────────────────────────────────────────────

export type TaskInput = {
  task: Task;
  steps: Step[];
  workLogs: WorkLog[];
  running?: { stepTitle?: string; elapsedMinutes: number };
  now: Date;
};

export type TaskReading = {
  verdict: Verdict;
  totalSteps: number;
  doneSteps: number;
  minutesSpent: number;
  nextStep?: Step;
  daysUntilDue?: number;
};

/** Walks the step tree depth-first and returns the first step that is not done. */
const firstUnfinishedInTreeOrder = (steps: Step[]): Step | undefined => {
  const childrenOf = new Map<string, Step[]>();
  steps.forEach((step) => {
    const key = step.parentStepId ?? "";
    const bucket = childrenOf.get(key) ?? [];
    bucket.push(step);
    childrenOf.set(key, bucket);
  });
  childrenOf.forEach((bucket) =>
    bucket.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
  );

  const seen = new Set<string>();
  // Descend BEFORE considering the node itself. A parent that is merely in progress is a container,
  // not a thing to do: when its first unfinished child exists, that child is the actionable answer.
  // A step with no unfinished children answers for itself.
  const walk = (parentKey: string): Step | undefined => {
    for (const step of childrenOf.get(parentKey) ?? []) {
      // parentStepId is an unconstrained string; a cycle would otherwise recurse without end.
      if (seen.has(step.id)) continue;
      seen.add(step.id);
      const inside = walk(step.id);
      if (inside) return inside;
      if (step.status !== "done") return step;
    }
    return undefined;
  };
  return walk("");
};

export const readTask = (input: TaskInput): TaskReading => {
  const { task, steps, workLogs, running, now } = input;

  const totalSteps = steps.length;
  const doneSteps = steps.filter((step) => step.status === "done").length;
  const { taskActivity } = buildTaskActivity(workLogs);
  const minutesSpent = taskActivity.get(task.id)?.totalMinutes ?? 0;
  const dueInDays = task.dueDate ? daysUntilDue(task.dueDate, now) : undefined;

  // The next decision, in the order the tree actually reads.
  //
  // Sorting the flat list by `order` is wrong and looked right: `order` is scoped to a step's
  // SIBLINGS, so every first child carries order 1. A flat sort therefore put "3.1 Impaginare il
  // documento" ahead of "2.1 Raccogliere costi materiali" — the verdict named a step three
  // positions further down the tree as the next thing to do.
  const nextStep = firstUnfinishedInTreeOrder(steps);

  const base = { totalSteps, doneSteps, minutesSpent, nextStep, daysUntilDue: dueInDays };

  const detail: Run[] = [];

  if (totalSteps > 0) {
    detail.push(figure(`${doneSteps} di ${totalSteps}`, doneSteps === totalSteps ? "good" : undefined));
    detail.push(text(" step chiusi"));
  } else {
    detail.push(text("Nessuno step"));
  }

  if (minutesSpent > 0) {
    detail.push(text(", "));
    detail.push(figure(formatMinutes(minutesSpent)));
    detail.push(text(" registrati"));
  }
  detail.push(text(". "));

  if (running) {
    detail.push(text("Adesso c'è una sessione aperta "));
    if (running.elapsedMinutes >= 1) detail.push(text("da "));
    detail.push(...elapsedRuns(running.elapsedMinutes));
    if (running.stepTitle) detail.push(text(` su ${running.stepTitle}`));
    detail.push(text(". "));
  }

  if (dueInDays !== undefined) {
    if (dueInDays < 0) {
      detail.push(text("La scadenza è passata da "));
      detail.push(...countRuns(Math.abs(dueInDays), "giorno", "giorni", "bad"));
      detail.push(text(". "));
    } else if (dueInDays === 0) {
      detail.push(text("Scade "));
      detail.push(emphasis("oggi", "warn"));
      detail.push(text(". "));
    } else {
      detail.push(text("Mancano "));
      detail.push(...countRuns(dueInDays, "giorno", "giorni"));
      detail.push(text(" alla scadenza. "));
    }
  }

  if (nextStep) {
    detail.push(text(`Il prossimo è ${nextStep.title}.`));
  }

  let headline: string;
  let sentiment: Sentiment;
  if (task.status === "done") {
    headline = "Chiuso.";
    sentiment = "good";
  } else if (task.status === "blocked") {
    headline = "Bloccato.";
    sentiment = "bad";
  } else if (dueInDays !== undefined && dueInDays < 0) {
    headline =
      Math.abs(dueInDays) === 1 ? "In ritardo di un giorno." : `In ritardo di ${Math.abs(dueInDays)} giorni.`;
    sentiment = "bad";
  } else if (dueInDays === 0 && (totalSteps === 0 || doneSteps / totalSteps < 0.6)) {
    headline = "Arriva stretto alla scadenza.";
    sentiment = "warn";
  } else if (dueInDays === 0) {
    headline = "Scade oggi, ma ci sei quasi.";
    sentiment = "warn";
  } else if (running) {
    headline = "Ci stai lavorando adesso.";
    sentiment = "good";
  } else if (totalSteps > 0 && doneSteps === totalSteps) {
    headline = "Tutti gli step sono chiusi.";
    sentiment = "good";
  } else if (totalSteps === 0) {
    // The one-line reminder end of the granularity range: not a broken task, just a small one.
    headline = "È una voce singola.";
    sentiment = "neutral";
  } else if (doneSteps === 0) {
    headline = "Non è ancora partito.";
    sentiment = "neutral";
  } else {
    headline = "In corso.";
    sentiment = "neutral";
  }

  return { ...base, verdict: { headline, sentiment, detail, isSparse: false } };
};

// ─── Insights ────────────────────────────────────────────────────────────────

export type InsightsInput = {
  workLogs: WorkLog[];
  now: Date;
};

export type InsightsReading = {
  verdict: Verdict;
  currentMonthKey: string;
  currentMinutes: number;
  previousMinutes: number;
  daysLeftInMonth: number;
  peakDayKey?: string;
  peakMinutes: number;
  topTag?: string;
  topTagMinutes: number;
};

export const readInsights = (input: InsightsInput): InsightsReading => {
  const { workLogs, now } = input;
  const today = todayKey(now);
  const currentMonthKey = today.slice(0, 7);

  const [year, month] = currentMonthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysLeftInMonth = daysInMonth - Number(today.slice(8, 10));

  const previousMonthDate = new Date(year, month - 2, 1);
  const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(
    previousMonthDate.getMonth() + 1,
  ).padStart(2, "0")}`;

  const { logDurations } = buildTaskActivity(workLogs);
  const totalsByDay = buildDailyWorkLogTotals(workLogs, logDurations);

  let currentMinutes = 0;
  let previousMinutes = 0;
  let peakDayKey: string | undefined;
  let peakMinutes = 0;
  totalsByDay.forEach((minutes, dayKey) => {
    if (dayKey.startsWith(currentMonthKey)) {
      currentMinutes += minutes;
      if (minutes > peakMinutes) {
        peakMinutes = minutes;
        peakDayKey = dayKey;
      }
    } else if (dayKey.startsWith(previousMonthKey)) {
      previousMinutes += minutes;
    }
  });

  const tagMinutes = new Map<string, number>();
  workLogs.forEach((log) => {
    const minutes = logDurations.get(log.id);
    if (!minutes || instantMonthKey(log.timestamp) !== currentMonthKey) return;
    new Set(log.tags.map((tag) => tag.trim()).filter(Boolean)).forEach((tag) => {
      tagMinutes.set(tag, (tagMinutes.get(tag) ?? 0) + minutes);
    });
  });
  let topTag: string | undefined;
  let topTagMinutes = 0;
  tagMinutes.forEach((minutes, tag) => {
    if (minutes > topTagMinutes) {
      topTagMinutes = minutes;
      topTag = tag;
    }
  });

  const base = {
    currentMonthKey,
    currentMinutes,
    previousMinutes,
    daysLeftInMonth,
    peakDayKey,
    peakMinutes,
    topTag,
    topTagMinutes,
  };

  if (currentMinutes === 0 && previousMinutes === 0) {
    return {
      ...base,
      verdict: {
        headline: "Non c'è ancora abbastanza da confrontare.",
        sentiment: "neutral",
        isSparse: true,
        detail: [
          text(
            "Serve qualche sessione registrata prima che un confronto fra mesi voglia dire qualcosa. Avvia il timer su un task, oppure aggiungi una nota con la durata.",
          ),
        ],
      },
    };
  }

  const monthLabel = formatMonthKey(currentMonthKey, { month: "long" });
  const previousLabel = formatMonthKey(previousMonthKey, { month: "long" });

  const detail: Run[] = [];
  detail.push(figure(formatMinutes(currentMinutes)));
  detail.push(text(` in ${monthLabel}`));

  if (previousMinutes > 0) {
    const delta = Math.round(((currentMinutes - previousMinutes) / previousMinutes) * 100);
    detail.push(text(" contro "));
    detail.push(figure(formatMinutes(previousMinutes)));
    detail.push(text(` di ${previousLabel}, `));
    detail.push(figure(`${delta > 0 ? "+" : ""}${delta}%`, delta >= 0 ? "good" : "warn"));
    // Comparing a part-month against a whole one is only fair if you say so.
    if (daysLeftInMonth > 0) {
      detail.push(text(" con ancora "));
      detail.push(...countRuns(daysLeftInMonth, "giorno", "giorni"));
      detail.push(text(" davanti"));
    }
  }
  detail.push(text(". "));

  if (peakDayKey && peakMinutes > 0) {
    detail.push(text("Il picco è stato "));
    detail.push(figure(formatMinutes(peakMinutes)));
    detail.push(text(" il "));
    detail.push(figure(String(Number(peakDayKey.slice(8, 10)))));
    detail.push(text(". "));
  }

  if (topTag) {
    detail.push(text("Il grosso è andato su "));
    detail.push(figure(`#${topTag}`));
    detail.push(text(", "));
    detail.push(figure(formatMinutes(topTagMinutes)));
    detail.push(text("."));
  }

  let headline: string;
  let sentiment: Sentiment;
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  if (previousMinutes === 0) {
    headline = `${capitalizedMonth} è il primo mese con dei dati.`;
    sentiment = "neutral";
  } else if (currentMinutes >= previousMinutes) {
    headline = `${capitalizedMonth} batte ${previousLabel}.`;
    sentiment = "good";
  } else {
    headline = `${capitalizedMonth} non tiene il passo di ${previousLabel}.`;
    sentiment = "warn";
  }

  return { ...base, verdict: { headline, sentiment, detail, isSparse: false } };
};

// ─── Lista task ──────────────────────────────────────────────────────────────

/**
 * A verdict over whatever slice of tasks the filters are showing.
 *
 * `shown` is the filtered list, `all` the whole account: the difference is what lets the verdict
 * say "the filter is hiding everything" instead of "you have no tasks", which are very different
 * pieces of news to give someone.
 */
export const readTaskList = (shown: Task[], all: Task[], now: Date): Verdict => {
  if (all.length === 0) {
    return {
      headline: "Il diario è vuoto.",
      sentiment: "neutral",
      isSparse: true,
      detail: [
        text(
          "Un task può essere una riga — «mandare il preventivo» — o un progetto con una scadenza e otto step. Comincia da uno qualsiasi: la struttura si aggiunge dopo, se serve.",
        ),
      ],
    };
  }

  if (shown.length === 0) {
    return {
      headline: "Il filtro non lascia passare niente.",
      sentiment: "neutral",
      isSparse: true,
      detail: [
        text("Ci sono "),
        ...countRuns(all.length, "task", "task"),
        text(" in archivio, ma nessuno corrisponde a quello che hai chiesto."),
      ],
    };
  }

  const open = shown.filter((task) => task.status !== "done");
  const overdue = open.filter(
    (task) => task.dueDate !== undefined && daysUntilDue(task.dueDate, now) < 0,
  );
  const blocked = open.filter((task) => task.status === "blocked");
  const unscheduled = open.filter((task) => !task.dueDate);

  const detail: Run[] = [];
  detail.push(...countRuns(open.length, "task aperto", "task aperti"));
  if (shown.length > open.length) {
    detail.push(text(" e "));
    detail.push(...countRuns(shown.length - open.length, "chiuso", "chiusi", "good"));
  }
  detail.push(text(". "));

  if (blocked.length > 0) {
    detail.push(figure(String(blocked.length), "bad"));
    detail.push(text(blocked.length === 1 ? " è fermo. " : " sono fermi. "));
  }
  if (unscheduled.length > 0) {
    detail.push(figure(String(unscheduled.length)));
    detail.push(text(unscheduled.length === 1 ? " non ha una scadenza." : " non hanno una scadenza."));
  }

  let headline: string;
  let sentiment: Sentiment;
  if (overdue.length > 0) {
    headline =
      overdue.length === 1 ? "Uno è già scaduto." : `${overdue.length} sono già scaduti.`;
    sentiment = "bad";
  } else if (open.length === 0) {
    headline = "Qui è tutto chiuso.";
    sentiment = "good";
  } else {
    headline = open.length === 1 ? "Resta una cosa aperta." : `Restano ${open.length} cose aperte.`;
    sentiment = "neutral";
  }

  return { headline, sentiment, detail, isSparse: false };
};

// ─── Timeline e Report ───────────────────────────────────────────────────────

/** A verdict over an arbitrary slice of logs, used by the Timeline and Report filters. */
export const readSlice = (
  workLogs: WorkLog[],
  scopedLogs: WorkLog[],
  label: string,
): Verdict => {
  if (scopedLogs.length === 0) {
    return {
      headline: "Qui non c'è niente da mostrare.",
      sentiment: "neutral",
      isSparse: true,
      detail: [text(`Nessun log ${label}. Cambia il filtro, oppure registra una sessione.`)],
    };
  }

  const { logDurations } = buildTaskActivity(workLogs);
  const minutes = scopedLogs.reduce((sum, log) => sum + (logDurations.get(log.id) ?? 0), 0);
  const days = new Set(scopedLogs.map((log) => instantDayKey(log.timestamp))).size;
  const tasks = new Set(scopedLogs.map((log) => log.taskId)).size;

  const detail: Run[] = [
    figure(formatMinutes(minutes)),
    text(" su "),
    ...countRuns(tasks, "task", "task"),
    text(", distribuiti su "),
    ...countRuns(days, "giornata", "giornate"),
    text("."),
  ];

  if (days > 0 && minutes > 0) {
    detail.push(text(" Fanno "));
    detail.push(figure(formatMinutes(Math.round(minutes / days))));
    detail.push(text(" al giorno lavorato."));
  }

  return {
    headline: `${formatMinutes(minutes)} ${label}.`,
    sentiment: "neutral",
    detail,
    isSparse: false,
  };
};

/** Days between two day keys, exported for screens that need the same arithmetic. */
export const daysBetween = daysBetweenKeys;
