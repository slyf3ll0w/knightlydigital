"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

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
 */
const TurnstileWidget = forwardRef<TurnstileHandle, { onToken: (token: string) => void }>(
  function TurnstileWidget({ onToken }, handle) {
    const ref = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;

    useImperativeHandle(handle, () => ({
      reset() {
        onTokenRef.current("");
        if (widgetId.current && window.turnstile) {
          window.turnstile.reset(widgetId.current);
        }
      },
    }));

    useEffect(() => {
      if (!SITE_KEY || !ref.current) return;

      function render() {
        if (!window.turnstile || !ref.current || widgetId.current) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
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
        if (widgetId.current && window.turnstile) {
          window.turnstile.remove(widgetId.current);
          widgetId.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!SITE_KEY) return null;
    return <div ref={ref} className="my-3" />;
  }
);

export default TurnstileWidget;
