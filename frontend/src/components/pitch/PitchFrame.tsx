import { Link, useParams, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PROJECT } from "@/lib/pitch-data";

export function PitchFrame({
  children,
  status = "Idle",
  active = false,
}: {
  children: ReactNode;
  status?: string;
  active?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // present once a script has been submitted and a route carries $jobId
  const { jobId } = useParams({ strict: false });

  const NAV = [
    { to: "/", label: "Upload", disabled: false },
    { to: "/process/$jobId", label: "Trace", disabled: !jobId },
    { to: "/scenes/$jobId", label: "Scenes", disabled: !jobId },
    { to: "/deck/$jobId", label: "Deck", disabled: !jobId },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5 md:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-display text-xl font-black uppercase tracking-tighter">
            Animatic
          </Link>
          <span
            className={`label border px-2 py-1 ${
              active ? "border-accent text-accent" : "border-border text-muted-foreground"
            }`}
          >
            {active && (
              <span className="mr-1.5 inline-block size-1.5 translate-y-[-1px] bg-accent align-middle" />
            )}
            {status}
          </span>
        </div>

        <nav className="flex items-center gap-6">
          {NAV.map((item) => {
            const prefix = item.to.split("/$")[0] || "/";
            const isActive = item.to === "/" ? pathname === "/" : pathname.startsWith(prefix);
            if (item.disabled) {
              return (
                <span key={item.to} className="label cursor-not-allowed text-muted-foreground/40">
                  {item.label}
                </span>
              );
            }
            const linkClassName = `label transition-colors hover:text-accent ${
              isActive
                ? "text-foreground underline underline-offset-[6px]"
                : "text-muted-foreground"
            }`;
            if (item.to === "/") {
              return (
                <Link key={item.to} to="/" className={linkClassName}>
                  {item.label}
                </Link>
              );
            }
            return (
              <Link key={item.to} to={item.to} params={{ jobId: jobId! }} className={linkClassName}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[3.5rem_1fr]">
        <div className="hidden items-end justify-center border-r border-border py-10 lg:flex">
          <h2 className="rotate-180 select-none font-display text-4xl font-black uppercase leading-none tracking-tighter text-foreground/10 [writing-mode:vertical-lr]">
            {PROJECT.title} / {PROJECT.draft}
          </h2>
        </div>
        <div className="min-w-0 pb-16">{children}</div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-4 border-t border-border bg-background px-6 py-2 md:px-8">
        <div className="label flex flex-wrap gap-4 text-muted-foreground">
          <span>Session {PROJECT.session}</span>
          <span className="hidden sm:inline">Pages {PROJECT.pages}</span>
          <span className={active ? "text-accent" : "text-muted-foreground"}>
            {active ? "● Agent working" : "○ Agent idle"}
          </span>
        </div>
      </footer>
    </div>
  );
}
