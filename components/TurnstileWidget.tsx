"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CaptchaAction } from "@/lib/captcha";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export type TurnstileHandle = {
  /** Re-run the challenge for a fresh token (tokens are single-use). */
  reset: () => void;
};

/**
 * Cloudflare Turnstile widget. Renders nothing until
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured, so forms work unchanged
 * before the captcha is activated.
 *
 * The challenge can run fully invisibly, which means a stuck challenge is
 * indistinguishable from "no captcha here" — the server then rejects the
 * sign-in and the user is stuck with nothing on screen to complete. Two
 * distinct failure shapes need catching:
 *
 *  - the challenge ERRORS: retry: "never" makes Turnstile report it to
 *    error-callback instead of retrying silently forever; we retry twice
 *    with backoff, then surface the fallback.
 *  - the challenge HANGS with no error at all — observed on IPv4-only
 *    networks, where a challenge asset (an IPv6-only hostname) never
 *    resolves. Only a deadline catches this: no token within WATCHDOG_MS
 *    and no visible challenge on screen → fallback.
 */
const WATCHDOG_MS = 20_000;

const TurnstileWidget = forwardRef<
  TurnstileHandle,
  { onToken: (token: string) => void; action?: CaptchaAction }
>(
  // `action` is stamped into the token and re-checked server side, so a token
  // minted on the signup form can't be spent on the login form.
  function TurnstileWidget({ onToken, action }, handle) {
    const ref = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const retries = useRef(0);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [failed, setFailed] = useState(false);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;

    function disarmWatchdog() {
      if (watchdog.current) {
        clearTimeout(watchdog.current);
        watchdog.current = null;
      }
    }

    function armWatchdog() {
      disarmWatchdog();
      watchdog.current = setTimeout(() => {
        // A visible challenge means Turnstile is waiting on the user, not
        // stuck — give it another window rather than declaring failure.
        const iframe = ref.current?.querySelector("iframe");
        if (iframe && iframe.offsetHeight > 0) {
          armWatchdog();
          return;
        }
        onTokenRef.current("");
        setFailed(true);
      }, WATCHDOG_MS);
    }

    function resetWidget() {
      onTokenRef.current("");
      setFailed(false);
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current);
        armWatchdog();
      }
    }

    useImperativeHandle(handle, () => ({
      reset: resetWidget,
    }));

    useEffect(() => {
      if (!SITE_KEY || !ref.current) return;

      function render() {
        if (!window.turnstile || !ref.current || widgetId.current) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          ...(action ? { action } : {}),
          callback: (token: string) => {
            retries.current = 0;
            disarmWatchdog();
            setFailed(false);
            onTokenRef.current(token);
          },
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => {
            onTokenRef.current("");
            if (retries.current < 2) {
              retries.current += 1;
              retryTimer.current = setTimeout(() => {
                if (widgetId.current && window.turnstile) {
                  window.turnstile.reset(widgetId.current);
                  armWatchdog();
                }
              }, 1000 * retries.current);
            } else {
              disarmWatchdog();
              setFailed(true);
            }
            // Handled — keep Turnstile from also logging its own error
            return true;
          },
          retry: "never",
          "refresh-expired": "auto",
          theme: "light",
          // The widget stays invisible unless Cloudflare actually needs the
          // user to interact — for most sign-ins the check runs silently and
          // the form never shifts. When it does appear, it spans the form
          // width instead of the fixed 300px box.
          appearance: "interaction-only",
          size: "flexible",
        });
        armWatchdog();
      }

      if (window.turnstile) {
        render();
      } else {
        // Two widgets mounting in the same tick (e.g. multi-step forms) must
        // share one script tag, or the second load clobbers the first's state.
        const existing = document.querySelector<HTMLScriptElement>(
          'script[src^="https://challenges.cloudflare.com/turnstile/"]'
        );
        if (existing) {
          existing.addEventListener("load", render);
        } else {
          const script = document.createElement("script");
          script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          script.async = true;
          script.onload = render;
          document.head.appendChild(script);
        }
      }

      return () => {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        disarmWatchdog();
        if (widgetId.current && window.turnstile) {
          window.turnstile.remove(widgetId.current);
          widgetId.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!SITE_KEY) return null;
    return (
      <div>
        <div ref={ref} />
        {failed && (
          <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Security check couldn&apos;t load.{" "}
            <button
              type="button"
              onClick={() => {
                retries.current = 0;
                resetWidget();
              }}
              className="font-semibold underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }
);

export default TurnstileWidget;
