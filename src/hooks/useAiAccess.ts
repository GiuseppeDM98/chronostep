/**
 * Whether this account may use the capture screen, asked once and remembered.
 *
 * The rule itself lives on the server, in `isAllowed`, and is enforced there on every POST. This
 * hook exists so the interface can be honest before the fact: the demo account's credentials are
 * printed on the sign-in screen, so it is reachable by anyone with the link, and offering it a
 * working-looking button that spends someone else's money and then refuses is a worse answer than
 * a control that is visibly inert with a sentence beside it.
 *
 * Two consequences worth stating. The answer is a courtesy, never the control — a client that
 * decided this for itself would be a second copy of the rule, and the copy that matters is the one
 * on the route. And it is cached per account for the life of the tab, because it is a property of
 * the deployment's configuration, not of anything the user is doing.
 */
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";

export type AiAccessReason = "not-allowed" | "not-configured" | "unreachable" | null;

export type AiAccess = {
  /** True until the first answer arrives. Offer nothing while it holds. */
  checking: boolean;
  allowed: boolean;
  reason: AiAccessReason;
};

type Answer = { allowed: boolean; reason: AiAccessReason };

const answers = new Map<string, Promise<Answer>>();

const ask = (uid: string, getIdToken: () => Promise<string>): Promise<Answer> => {
  const pending = answers.get(uid);
  if (pending) return pending;

  const request = (async (): Promise<Answer> => {
    try {
      const idToken = await getIdToken();
      const response = await fetch("/api/ai/capture", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) return { allowed: false, reason: "not-allowed" };
      const payload = (await response.json()) as Answer;
      return { allowed: payload.allowed === true, reason: payload.reason ?? null };
    } catch {
      // A network failure is not a refusal, and saying "you are not allowed" would be a lie. The
      // screen offers the control and lets the real request produce the real error.
      return { allowed: true, reason: "unreachable" };
    }
  })();

  answers.set(uid, request);
  return request;
};

export const useAiAccess = (): AiAccess => {
  const { user } = useAuth();
  const [access, setAccess] = useState<AiAccess>({
    checking: true,
    allowed: false,
    reason: null,
  });

  useEffect(() => {
    if (!user) {
      setAccess({ checking: false, allowed: false, reason: "not-allowed" });
      return;
    }
    let active = true;
    ask(user.uid, () => user.getIdToken()).then((answer) => {
      if (active) setAccess({ checking: false, ...answer });
    });
    return () => {
      active = false;
    };
  }, [user]);

  return access;
};
