import Link from "next/link";
import { BookOpen, ShieldCheck, Lock, ArrowRight, Terminal } from "lucide-react";
import { getAllDocs } from "@/lib/docs";

export default function DocsIndexPage() {
  const docs = getAllDocs();

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800">
            OPERATOR MANUAL &amp; GUIDES
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          X4G4T Documentation &amp; Reference
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Explore complete operational manuals, policy templates, AI provider configurations, and enterprise IAM authentication guides.
        </p>
      </div>

      {/* Guide Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {docs.map((doc) => {
          const IconComponent =
            doc.icon === "BookOpen"
              ? BookOpen
              : doc.icon === "ShieldCheck"
              ? ShieldCheck
              : Lock;

          return (
            <Link
              key={doc.slug}
              href={`/dashboard/docs/${doc.slug}`}
              className="group flex flex-col justify-between p-5 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 hover:border-indigo-500/50 transition-all shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 group-hover:bg-indigo-600/20 transition">
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {doc.readTime}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-indigo-400">
                    {doc.category}
                  </span>
                  <h3 className="text-base font-semibold text-white group-hover:text-indigo-300 transition mt-0.5">
                    {doc.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {doc.subtitle}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium text-indigo-400 group-hover:text-indigo-300">
                <span>Read Guide</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Quickstart Architecture Banner */}
      <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <h4 className="text-sm font-semibold text-white">Local Database Bootstrap &amp; Seeding</h4>
          </div>
          <p className="text-xs text-slate-400">
            Initialize PostgreSQL tables, indexes, and seed baseline guardrail policies with a single CLI command.
          </p>
        </div>
        <div className="px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 select-all">
          pnpm db:bootstrap
        </div>
      </div>
    </div>
  );
}

