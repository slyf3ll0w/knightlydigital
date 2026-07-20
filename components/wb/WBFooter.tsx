import Image from "next/image";
import Link from "next/link";
import { WB_HOME } from "./WBNav";

const APP_STORE_URL = "https://apps.apple.com/app/workbench-fsm/id6789991103";

export default function WBFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Image
            src="/workbench-logo.png"
            alt="WorkBench"
            width={1714}
            height={285}
            className="h-6 w-auto"
          />
          <p className="mt-4 text-[13px] leading-relaxed text-gray-500">
            Field service management for home-service teams. Free to run,
            fair when you get paid. A{" "}
            <a
              href="https://streamflaire.com"
              target="_blank"
              rel="noopener"
              className="font-semibold text-gray-600 hover:text-gray-900"
            >
              Streamflaire
            </a>{" "}
            product.
          </p>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener"
            aria-label="Download WorkBench on the App Store"
            className="mt-5 inline-block transition-opacity hover:opacity-80"
          >
            <Image
              src="/app-store-badge.svg"
              alt="Download on the App Store"
              width={120}
              height={40}
              unoptimized
              className="h-10 w-auto"
            />
          </a>
        </div>
        <div className="flex gap-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
              Product
            </p>
            <ul className="mt-3 space-y-2 text-[13.5px] text-gray-600">
              <li>
                <Link href={WB_HOME} className="hover:text-gray-900">
                  Overview
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-gray-900">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/roadmap" className="hover:text-gray-900">
                  Roadmap
                </Link>
              </li>
              <li>
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener"
                  className="hover:text-gray-900"
                >
                  iPhone app
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
              Company
            </p>
            <ul className="mt-3 space-y-2 text-[13.5px] text-gray-600">
              <li>
                <Link href="/apply" className="hover:text-gray-900">
                  Apply for access
                </Link>
              </li>
              <li>
                <a
                  href="https://streamflaire.com"
                  target="_blank"
                  rel="noopener"
                  className="hover:text-gray-900"
                >
                  Streamflaire.com
                </a>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-gray-900">
                  Privacy
                </Link>
              </li>
              <li>
                <a href="mailto:info@streamflaire.com" className="hover:text-gray-900">
                  info@streamflaire.com
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <p className="text-[11.5px] text-gray-400">© 2026 WorkBench</p>
          <p className="text-[11.5px] text-gray-400">Dallas–Fort Worth, TX</p>
        </div>
      </div>
    </footer>
  );
}
