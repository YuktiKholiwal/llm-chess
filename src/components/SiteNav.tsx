"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The bar that makes two separate evals feel like one site.
 *
 * Grouped rather than flat: the arena and the reasoning eval measure different
 * things, and a single undifferentiated row of five links would imply they are
 * five peers. The separator is doing real work.
 *
 * The live match page does not use this -- it sizes the board against the
 * viewport and has its own compact bar. Its links are kept in step with these
 * by hand, which is a two-line cost paid once.
 */

type Item = { href: string; label: string; hint: string };

const GROUPS: { name: string; items: Item[] }[] = [
  {
    name: "Arena",
    items: [
      { href: "/arena", label: "Live match", hint: "Two models play a full game" },
      { href: "/arena/scorecard", label: "Scorecard", hint: "Same positions, every model, solo" },
    ],
  },
  {
    name: "Reasoning",
    items: [
      { href: "/reasoning", label: "Results", hint: "Is what the model says about the board true?" },
      { href: "/reasoning/traces", label: "Traces", hint: "Browse all 600 reasoning traces" },
    ],
  },
];

/**
 * Exact, with one deliberate exception: `/reasoning/xjzsD` is a trace and
 * belongs to the Traces tab. A prefix test would be wrong in both directions
 * here -- it would light Results for every trace, since they all start with
 * `/reasoning`, and light Live match on the scorecard beneath it.
 */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/reasoning/traces") return pathname.startsWith("/reasoning/");
  return pathname === href;
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-arena-border bg-arena-bg/85 backdrop-blur-md">
      <nav
        aria-label="Sections"
        className="mx-auto flex h-14 max-w-[1120px] items-center gap-5 px-6"
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-[13.5px] font-semibold tracking-[-0.015em] text-arena-text transition-opacity hover:opacity-70"
        >
          <span aria-hidden="true" className="text-[15px] leading-none">
            ♟
          </span>
          Chess evals
        </Link>

        <div className="scroll-thin -mx-1 flex items-center gap-1 overflow-x-auto px-1">
          {GROUPS.map((group, i) => (
            <div key={group.name} className="flex items-center gap-1">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="mx-2.5 h-4 w-px shrink-0 bg-arena-border"
                />
              )}
              <span className="mr-1 hidden shrink-0 text-[10px] font-medium uppercase tracking-[0.09em] text-arena-faint md:inline">
                {group.name}
              </span>
              {group.items.map((item) => {
                const current = isCurrent(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.hint}
                    aria-current={current ? "page" : undefined}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors ${
                      current
                        ? "bg-arena-panel-2 font-medium text-arena-text"
                        : "text-arena-faint hover:bg-arena-panel hover:text-arena-dim"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </header>
  );
}
