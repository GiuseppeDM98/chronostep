/**
 * The only server endpoint in ChronoStep, and deliberately the narrowest one that could work.
 *
 * It exists for exactly one reason: an Anthropic API key cannot live in a browser. Everything else
 * about this app stays where it was — this route holds no Firebase credentials, opens no database
 * connection, and writes nothing. It receives notes, asks Claude for a plan, and hands that plan
 * back to the client, which writes it through the ordinary store under the ordinary Firestore
 * rules. The boundary between two accounts' data is still `firestore.rules` and nothing else.
 *
 * Three things guard it, because a route holding a paid API key is a route somebody will try:
 *
 * 1. **A verified Firebase ID token.** Verified by asking Google's identity endpoint rather than by
 *    checking a signature here. `firebase-admin` was removed from this project during the security
 *    audit — it was a direct dependency no line of `src/` imported and it carried most of the
 *    project's CVEs — and hand-rolling JWT verification to replace it would be trading a dependency
 *    for a class of bug that is much harder to notice. A round trip costs milliseconds against a
 *    call that takes seconds.
 * 2. **An explicit list of addresses.** The demo account's credentials are printed on the sign-in
 *    screen, so "any authenticated user" means "anyone with the link", and this endpoint spends
 *    real money. With `AI_ALLOWED_EMAILS` unset the route is open in development and closed in
 *    production: a feature that is quietly dead is better than a bill that is quietly growing.
 * 3. **A frequency limit per account.** Best effort only — see the note on `recentCalls`.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  CAPTURE_JSON_SCHEMA,
  MAX_NOTES_LENGTH,
  buildCaptureSystemPrompt,
  buildCaptureUserMessage,
  type CaptureContextPayload,
} from "../../../../lib/aiPrompt";

export const runtime = "nodejs";

/**
 * Vercel cuts a function off at its own limit, not at the SDK's.
 *
 * The default is ten seconds, and a request with thinking enabled routinely takes longer than that,
 * so without this line the feature would fail on the platform it is deployed to while working
 * perfectly in `next dev`. Sixty seconds is the ceiling on the Hobby plan.
 */
export const maxDuration = 60;

const MODEL = "claude-opus-5";

/**
 * `medium` rather than the default `high`.
 *
 * Turning notes into tasks is extraction with a little judgement, not a hard reasoning problem, and
 * the difference the top of the range makes here is small while the latency it costs is spent
 * inside a sixty-second window that also has to hold the network round trip.
 */
const EFFORT = "medium";

/** Enough for twenty tasks with their outlines; the schema keeps the response from sprawling. */
const MAX_TOKENS = 8000;

// ─── Access ──────────────────────────────────────────────────────────────────

type Caller = { uid: string; email: string };

const identityToolkitBase = () =>
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"
    ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1"
    : "https://identitytoolkit.googleapis.com/v1";

/**
 * Resolve a Firebase ID token to the account it belongs to.
 *
 * Google validates the signature, the audience and the expiry; an invalid or expired token comes
 * back as a 400 and this returns null. The API key is the public web key — it identifies the
 * project, it does not authorise anything.
 *
 * @returns The caller, or null when the token is not a valid one for this project.
 */
const verifyIdToken = async (idToken: string): Promise<Caller | null> => {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`${identityToolkitBase()}/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { users?: Array<{ localId?: string; email?: string }> };
  const user = payload.users?.[0];
  if (!user?.localId) return null;
  return { uid: user.localId, email: (user.email ?? "").toLowerCase() };
};

const allowedEmails = new Set(
  (process.env.AI_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const isAllowed = (caller: Caller): boolean => {
  if (allowedEmails.size > 0) return allowedEmails.has(caller.email);
  // Unset: open locally so the feature can be developed, closed in production so it cannot be
  // reached by whoever finds the demo credentials on the sign-in screen.
  return process.env.NODE_ENV !== "production";
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_CALLS = 30;

/**
 * Recent call timestamps per account.
 *
 * Module state, so it lives as long as the serverless instance and no longer: two instances mean
 * two independent counters, and a cold start forgets everything. It is a brake on a runaway loop or
 * a stuck retry, not a quota — the real ceiling is the allow list above and the spend limit on the
 * Anthropic account.
 */
const recentCalls = new Map<string, number[]>();

const takeRateLimitSlot = (uid: string, now: number): boolean => {
  const window = (recentCalls.get(uid) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
  if (window.length >= RATE_LIMIT_CALLS) {
    recentCalls.set(uid, window);
    return false;
  }
  window.push(now);
  recentCalls.set(uid, window);
  return true;
};

// ─── Request ─────────────────────────────────────────────────────────────────

type CaptureRequest = {
  notes: string;
  today: string;
  context: CaptureContextPayload;
};

const fail = (status: number, message: string) =>
  Response.json({ error: message }, { status });

/** Read the body without trusting any of it. Returns a message on the first thing that is wrong. */
const readRequest = (body: unknown): CaptureRequest | string => {
  if (typeof body !== "object" || body === null) return "La richiesta non è leggibile.";
  const source = body as Record<string, unknown>;

  const notes = typeof source.notes === "string" ? source.notes.trim() : "";
  if (!notes) return "Non hai scritto niente da leggere.";
  if (notes.length > MAX_NOTES_LENGTH) {
    return `Le note sono troppo lunghe: ${notes.length} caratteri, il limite è ${MAX_NOTES_LENGTH}.`;
  }

  const today = typeof source.today === "string" ? source.today : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return "La richiesta non porta una data valida.";

  const rawContext = (source.context ?? {}) as Record<string, unknown>;
  const context: CaptureContextPayload = {
    tasks: Array.isArray(rawContext.tasks) ? (rawContext.tasks as CaptureContextPayload["tasks"]) : [],
    tags: Array.isArray(rawContext.tags) ? (rawContext.tags as string[]) : [],
  };

  return { notes, today, context };
};

// ─── The call ────────────────────────────────────────────────────────────────

/**
 * Ask Claude for a plan.
 *
 * The response format is pinned by a JSON schema, so the first text block is guaranteed to be valid
 * JSON — but "guaranteed" is only true when the model got to finish, which is why `stop_reason` is
 * read before the text is.
 *
 * @returns The parsed response, or a message explaining why there isn't one.
 */
const askForPlan = async (
  client: Anthropic,
  request: CaptureRequest,
): Promise<{ plan: unknown } | { error: string; status: number }> => {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildCaptureSystemPrompt(request.today),
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: CAPTURE_JSON_SCHEMA },
    },
    messages: [
      { role: "user", content: buildCaptureUserMessage(request.notes, request.context) },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    return {
      status: 502,
      error: "Le note producevano più di quanto ci stia in una risposta. Provane un pezzo per volta.",
    };
  }
  if (response.stop_reason === "refusal") {
    return { status: 502, error: "Claude si è rifiutato di leggere queste note." };
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { status: 502, error: "Claude ha risposto senza testo." };
  }

  try {
    return { plan: JSON.parse(textBlock.text) };
  } catch {
    return { status: 502, error: "La risposta di Claude non era leggibile." };
  }
};

/** Turn an SDK failure into a status and a sentence the user can act on. */
const describeApiError = (error: unknown): { status: number; message: string } => {
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 500, message: "La chiave della Claude API non è valida." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Claude è sotto pressione. Riprova fra un minuto." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: "Non sono riuscito a raggiungere Claude." };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, message: `Claude ha risposto con un errore (${error.status}).` };
  }
  return { status: 500, message: "Qualcosa è andato storto mentre leggevo le note." };
};

// ─── Handlers ────────────────────────────────────────────────────────────────

/** The caller behind a request, or null when the bearer token is missing or not ours. */
const callerFrom = async (request: Request): Promise<Caller | null> => {
  const header = request.headers.get("authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!idToken) return null;
  return verifyIdToken(idToken);
};

/**
 * May this account use the capture screen?
 *
 * The screen asks before it offers anything, so an account that cannot use the feature meets a
 * disabled control and a sentence explaining why, rather than a working-looking button that fails
 * after it has been filled in and pressed. It answers from the same `isAllowed` the POST enforces:
 * a second copy of that rule on the client would eventually disagree with this one, and the copy
 * that matters is this one — the UI here is a courtesy, never the control.
 */
export async function GET(request: Request) {
  const caller = await callerFrom(request);
  if (!caller) return fail(401, "Devi essere autenticato.");

  if (!isAllowed(caller)) {
    return Response.json({ allowed: false, reason: "not-allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ allowed: false, reason: "not-configured" });
  }
  return Response.json({ allowed: true, reason: null });
}

export async function POST(request: Request) {
  // Authenticate, then authorise, then look at the configuration. Checking the key first was the
  // obvious order and the wrong one: it answered "is the AI configured on this deployment?" to a
  // caller who had not proved they were anybody.
  const caller = await callerFrom(request);
  if (!caller) return fail(401, "La sessione è scaduta. Esci e rientra.");
  if (!isAllowed(caller)) {
    return fail(403, "Questo account non è abilitato a usare l'AI.");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail(500, "La Claude API non è configurata su questo ambiente.");
  }
  if (!takeRateLimitSlot(caller.uid, Date.now())) {
    return fail(429, "Hai fatto molte richieste in un'ora. Riprova più tardi.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "La richiesta non è leggibile.");
  }

  const parsed = readRequest(body);
  if (typeof parsed === "string") return fail(400, parsed);

  try {
    const result = await askForPlan(new Anthropic({ apiKey }), parsed);
    if ("error" in result) return fail(result.status, result.error);
    // Returned raw on purpose: the ownership checks belong on the client, where the account's real
    // task and step ids are. See normalizeCapturePlan in src/lib/aiCapture.ts.
    return Response.json({ plan: result.plan });
  } catch (error) {
    const described = describeApiError(error);
    // Logged server-side because the client is told a sentence, not a stack: the detail has to
    // land somewhere or a failure in production is undiagnosable.
    console.error("[ai/capture]", error);
    return fail(described.status, described.message);
  }
}
