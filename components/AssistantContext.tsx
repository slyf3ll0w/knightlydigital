"use client";

import { createContext, useContext } from "react";

/**
 * What the shell knows about Atlas, for pages that want their own way in
 * (the phone home's Atlas row). The shell owns the drawer and its state;
 * pages only ask it to open. `available` is false when the company has
 * Atlas off, the account is in pre-approval preview, or no AI key is set —
 * consumers render nothing in that case so there is never a dead button.
 */
export type AssistantContextValue = {
  available: boolean;
  /** Meter spent — the drawer still opens, showing the refill notice. */
  locked: boolean;
  name: string;
  /** Company accent for AtlasMark; undefined = the default badge color. */
  accent?: string;
  open: () => void;
};

const AssistantContext = createContext<AssistantContextValue>({
  available: false,
  locked: false,
  name: "Atlas",
  open: () => {},
});

export const AssistantProvider = AssistantContext.Provider;

export function useAssistant(): AssistantContextValue {
  return useContext(AssistantContext);
}
