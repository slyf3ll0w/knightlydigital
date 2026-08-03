"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

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
 * The challenge can run fully invisibly, which means a crashed challenge is
 * indistinguishable from "no captcha here" — the server then rejects the
 * sign-in and the user is stuck with nothing on screen to complete. So a
 * failed challenge quietly retries twice, and only if Turnstile stays down
 * does a visible "try again" fallback appear.
 */
const TurnstileWidget = forwardRef<TurnstileHandle, { onToken: (token: string) => void }>(
  function TurnstileWidget({ onToken }, handle) {
    const ref = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const retries = useRef(0);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [failed, setFailed] = useState(false);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;

    function resetWidget() {
      onTokenRef.current("");
      setFailed(false);
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current);
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
          callback: (token: string) => {
            retries.current = 0;
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
                }
              }, 1000 * retries.current);
            } else {
              setFailed(true);
            }
            // Handled — keep Turnstile from also logging its own error
            return true;
          },
          "refresh-expired": "auto",
          theme: "light",
        });
      }

      if (window.turnstile) {
        render();
      } else {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = render;
        document.head.appendChild(script);
      }

      return () => {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        if (widgetId.current && window.turnstile) {
          window.turnstile.remove(widgetId.current);
          widgetId.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!SITE_KEY) return null;
    return (
      <div className="my-3">
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
