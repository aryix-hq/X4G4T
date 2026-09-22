import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  ShieldCheck,
  Lock,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Clock,
  Tag
} from "lucide-react";
import { getDocContent, getAllDocs } from "@/lib/docs";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface DocPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function DocViewPage({ params }: DocPageProps) {
  const { slug } = await params;
  const docData = getDocContent(slug);

  if (!docData) {
    notFound();
  }

  const { metadata, content } = docData;
  const allDocs = getAllDocs();
  const currentIndex = allDocs.findIndex((d) => d.slug === slug);
  const prevDoc = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
  const nextDoc = currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/dashboard" className="hover:text-white transition">
          Dashboard
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-600" />
        <Link href="/dashboard/docs" className="hover:text-white transition">
          Documentation
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-600" />
        <span className="text-indigo-400 font-medium">{metadata.title}</span>
      </nav>

      {/* Guide Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {allDocs.map((tab) => {
          const isActive = tab.slug === slug;
          const TabIcon =
            tab.icon === "BookOpen"
              ? BookOpen
              : tab.icon === "ShieldCheck"
              ? ShieldCheck
              : Lock;

          return (
            <Link
              key={tab.slug}
              href={`/dashboard/docs/${tab.slug}`}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <TabIcon className="h-3.5 w-3.5" />
              <span>{tab.title}</span>
            </Link>
          );
        })}
      </div>

      {/* Header Info */}
      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/80 text-indigo-400 font-mono text-[11px]">
            <Tag className="h-3 w-3" />
            {metadata.category}
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <Clock className="h-3 w-3" />
            {metadata.readTime}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {metadata.title}
        </h1>
        <p className="text-sm text-slate-400">{metadata.subtitle}</p>
      </div>

      {/* Document Content Card */}
      <div className="p-6 md:p-8 rounded-xl border border-slate-800 bg-slate-900/30 shadow-sm">
        <MarkdownRenderer content={content} />
      </div>

      {/* Prev / Next Navigation */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
        {prevDoc ? (
          <Link
            href={`/dashboard/docs/${prevDoc.slug}`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-slate-300 hover:text-white transition text-xs font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <div className="text-left">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Previous</div>
              <div>{prevDoc.title}</div>
            </div>
          </Link>
        ) : (
          <div />
        )}

        {nextDoc && (
          <Link
            href={`/dashboard/docs/${nextDoc.slug}`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-slate-300 hover:text-white transition text-xs font-medium text-right"
          >
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-mono">Next</div>
              <div>{nextDoc.title}</div>
            </div>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

