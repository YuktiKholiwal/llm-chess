import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "./SiteNav";
import { ArrowRightIcon } from "./ui";

/**
 * The frame every reading page shares: the section nav, and one column width
 * so a table on the scorecard lines up with a table on the reasoning results.
 *
 * The live match page is deliberately outside this. It is an application
 * rather than a document -- full height, its own chrome -- and forcing it into
 * a centred column would cost the board the vertical space it needs.
 */
export function PageShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  /** Widens the column for the trace browser, which is a table of 600 rows. */
  wide?: boolean;
}) {
  return (
    <>
      <SiteNav />
      <main
        className={`mx-auto px-6 pb-24 pt-12 sm:pt-16 ${
          wide ? "max-w-[1320px]" : "max-w-[1120px]"
        }`}
      >
        {children}
      </main>
    </>
  );
}

/**
 * The link that ends a page. Every section closes by pointing at the one a
 * reader would want next, so the site can be walked end to end without ever
 * going back up to the nav.
 */
export function NextStep({
  href,
  kicker,
  title,
  body,
}: {
  href: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group mt-20 flex items-center gap-6 rounded-xl border border-arena-border bg-arena-panel px-6 py-6 transition-colors hover:border-arena-edge hover:bg-arena-panel-2"
    >
      <div className="min-w-0">
        <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
          {kicker}
        </p>
        <h2 className="text-[16px] font-medium tracking-[-0.015em] text-arena-text">
          {title}
        </h2>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-[1.65] text-arena-dim">
          {body}
        </p>
      </div>
      <span className="ml-auto shrink-0 text-arena-faint transition-colors group-hover:text-arena-text">
        <ArrowRightIcon />
      </span>
    </Link>
  );
}
