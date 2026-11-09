"use client";

import { useEffect } from "react";

/**
 * WorkBench's own "Contact us" website form (company work-bench, form
 * contact-us), placed with the same embed code a customer pastes on their
 * site. David 2026-11-03: the marketing site should run on our own product so
 * we test it and know it when talking to clients. Submissions land in the
 * WorkBench company's leads like any customer's form.
 *
 * The script is the production one on purpose, so local and staging show the
 * real form too. embed.js turns the placeholder into an iframe; scan() picks
 * up placeholders mounted after the script first ran (the floating panel).
 */
const EMBED_SRC = "https://workbenchfsm.com/embed.js";

declare global {
  interface Window {
    WorkBenchEmbed?: { scan: () => void };
  }
}

/**
 * `path` is the item on WorkBench's own booking page: "contact-us" (the
 * message form, default) or "phone-call" (the setup-call calendar, /book-a-call).
 */
export default function WBEmbedForm({
  path = "contact-us",
  title = "Contact us — WorkBench",
}: {
  path?: string;
  title?: string;
}) {
  useEffect(() => {
    if (window.WorkBenchEmbed) {
      window.WorkBenchEmbed.scan();
      return;
    }
    if (document.querySelector(`script[src="${EMBED_SRC}"]`)) return; // loading; it scans on run
    const s = document.createElement("script");
    s.src = EMBED_SRC;
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return <div data-workbench-form="work-bench" data-path={path} data-title={title} />;
}
