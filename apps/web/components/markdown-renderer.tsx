"use client";

import React, { useState } from "react";
import { Check, Copy, Info, AlertTriangle, ShieldAlert, Sparkles } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  // Pre-process and parse markdown lines
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];

  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  const flushTable = (key: string) => {
    if (inTable && tableHeader.length > 0) {
      elements.push(
        <div key={key} className="my-5 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                {tableHeader.map((h, i) => (
                  <th key={i} className="px-4 py-2.5 font-semibold text-slate-200">
                    {parseInline(h.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/30 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-4 py-2 text-slate-300">
                      {parseInline(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      inTable = false;
      tableHeader = [];
      tableRows = [];
    }
  };

  const flushBlockquote = (key: string) => {
    if (inBlockquote && blockquoteLines.length > 0) {
      const firstLine = blockquoteLines[0] || "";
      let alertType: "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION" | null = null;

      if (firstLine.includes("[!NOTE]")) alertType = "NOTE";
      else if (firstLine.includes("[!TIP]")) alertType = "TIP";
      else if (firstLine.includes("[!IMPORTANT]")) alertType = "IMPORTANT";
      else if (firstLine.includes("[!WARNING]")) alertType = "WARNING";
      else if (firstLine.includes("[!CAUTION]")) alertType = "CAUTION";

      const remainingLines = alertType
        ? blockquoteLines.slice(1).map((l) => l.replace(/^>\s*/, ""))
        : blockquoteLines.map((l) => l.replace(/^>\s*/, ""));

      if (alertType) {
        const styles = {
          NOTE: {
            bg: "bg-blue-950/30",
            border: "border-blue-500/40",
            text: "text-blue-300",
            icon: <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />,
            title: "Note"
          },
          TIP: {
            bg: "bg-emerald-950/30",
            border: "border-emerald-500/40",
            text: "text-emerald-300",
            icon: <Sparkles className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />,
            title: "Tip"
          },
          IMPORTANT: {
            bg: "bg-indigo-950/30",
            border: "border-indigo-500/40",
            text: "text-indigo-300",
            icon: <Info className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />,
            title: "Important"
          },
          WARNING: {
            bg: "bg-amber-950/30",
            border: "border-amber-500/40",
            text: "text-amber-300",
            icon: <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />,
            title: "Warning"
          },
          CAUTION: {
            bg: "bg-rose-950/30",
            border: "border-rose-500/40",
            text: "text-rose-300",
            icon: <ShieldAlert className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />,
            title: "Caution"
          }
        }[alertType];

        elements.push(
          <div
            key={key}
            className={`my-4 p-3.5 rounded-lg border ${styles.bg} ${styles.border} flex items-start gap-3`}
          >
            {styles.icon}
            <div className="flex-1 text-xs">
              <div className={`font-semibold mb-1 ${styles.text}`}>{styles.title}</div>
              <div className="text-slate-300 space-y-1">
                {remainingLines.map((line, idx) => (
                  <p key={idx}>{parseInline(line)}</p>
                ))}
              </div>
            </div>
          </div>
        );
      } else {
        elements.push(
          <blockquote
            key={key}
            className="my-4 pl-4 border-l-2 border-indigo-500/60 text-slate-300 italic text-xs space-y-1"
          >
            {remainingLines.map((line, idx) => (
              <p key={idx}>{parseInline(line)}</p>
            ))}
          </blockquote>
        );
      }

      inBlockquote = false;
      blockquoteLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // 1. Code Block Fence (```)
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        // End of code block
        const codeText = codeBlockLines.join("\n");
        elements.push(
          <CodeBlockView key={`code-${i}`} code={codeText} language={codeBlockLang} />
        );
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockLines = [];
      } else {
        // Flush any active table or blockquote
        flushTable(`table-before-code-${i}`);
        flushBlockquote(`quote-before-code-${i}`);

        inCodeBlock = true;
        codeBlockLang = line.trim().replace(/^```/, "").trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 2. Tables (| col1 | col2 |)
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      flushBlockquote(`quote-before-table-${i}`);

      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      // Check if it's the separator row (e.g. | :--- | :--- |)
      const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));

      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else if (!isSeparator) {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      flushTable(`table-${i}`);
    }

    // 3. Blockquotes (> ...)
    if (line.trim().startsWith(">")) {
      inBlockquote = true;
      blockquoteLines.push(line.trim());
      continue;
    } else if (inBlockquote) {
      flushBlockquote(`quote-${i}`);
    }

    // 4. Headings
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-2xl font-bold text-white mt-8 mb-4 tracking-tight">
          {parseInline(line.replace(/^#\s+/, ""))}
        </h1>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-lg font-bold text-white mt-7 mb-3 border-b border-slate-800 pb-1.5 tracking-tight">
          {parseInline(line.replace(/^##\s+/, ""))}
        </h2>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-semibold text-indigo-300 mt-5 mb-2 tracking-tight">
          {parseInline(line.replace(/^###\s+/, ""))}
        </h3>
      );
      continue;
    }
    if (line.startsWith("#### ")) {
      elements.push(
        <h4 key={`h4-${i}`} className="text-xs font-semibold text-slate-200 mt-4 mb-1.5 uppercase tracking-wider">
          {parseInline(line.replace(/^####\s+/, ""))}
        </h4>
      );
      continue;
    }

    // 5. Horizontal Rules
    if (line.trim() === "---" || line.trim() === "***" || line.trim() === "___") {
      elements.push(<hr key={`hr-${i}`} className="my-6 border-slate-800" />);
      continue;
    }

    // 6. Lists
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      elements.push(
        <li key={`li-${i}`} className="text-xs text-slate-300 ml-4 list-disc my-1">
          {parseInline(line.trim().replace(/^[-*]\s+/, ""))}
        </li>
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line.trim())) {
      const match = line.trim().match(/^(\d+)\.\s+(.*)/);
      if (match) {
        elements.push(
          <li key={`oli-${i}`} className="text-xs text-slate-300 ml-4 list-decimal my-1">
            {parseInline(match[2]!)}
          </li>
        );
        continue;
      }
    }

    // 7. Empty line
    if (line.trim() === "") {
      elements.push(<div key={`sp-${i}`} className="h-2" />);
      continue;
    }

    // 8. Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="text-xs text-slate-300 leading-relaxed my-1.5">
        {parseInline(line)}
      </p>
    );
  }

  // Flush remaining
  flushTable("table-end");
  flushBlockquote("quote-end");

  return <div className={`markdown-body space-y-1 ${className}`}>{elements}</div>;
}

function CodeBlockView({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-lg border border-slate-800 bg-slate-950 overflow-hidden shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
        <span>{language || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition px-1.5 py-0.5 rounded hover:bg-slate-800 cursor-pointer"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-3 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseInline(text: string): React.ReactNode {
  // Regex parsing for bold, code, links
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // 1. Inline code: `code`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/);
    // 2. Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*(.*)$/);
    // 3. Link: [text](url)
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/);

    // Find earliest match
    let earliest: "code" | "bold" | "link" | null = null;
    let minIndex = remaining.length;

    if (codeMatch && codeMatch[1]!.length < minIndex) {
      minIndex = codeMatch[1]!.length;
      earliest = "code";
    }
    if (boldMatch && boldMatch[1]!.length < minIndex) {
      minIndex = boldMatch[1]!.length;
      earliest = "bold";
    }
    if (linkMatch && linkMatch[1]!.length < minIndex) {
      minIndex = linkMatch[1]!.length;
      earliest = "link";
    }

    if (!earliest) {
      parts.push(<React.Fragment key={key++}>{remaining}</React.Fragment>);
      break;
    }

    if (earliest === "code" && codeMatch) {
      if (codeMatch[1]) parts.push(<React.Fragment key={key++}>{codeMatch[1]}</React.Fragment>);
      parts.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[11px]"
        >
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3]!;
    } else if (earliest === "bold" && boldMatch) {
      if (boldMatch[1]) parts.push(<React.Fragment key={key++}>{boldMatch[1]}</React.Fragment>);
      parts.push(
        <strong key={key++} className="font-semibold text-white">
          {boldMatch[2]}
        </strong>
      );
      remaining = boldMatch[3]!;
    } else if (earliest === "link" && linkMatch) {
      if (linkMatch[1]) parts.push(<React.Fragment key={key++}>{linkMatch[1]}</React.Fragment>);
      const href = linkMatch[3]!;
      const isExternal = href.startsWith("http://") || href.startsWith("https://");
      parts.push(
        <a
          key={key++}
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
        >
          {linkMatch[2]}
        </a>
      );
      remaining = linkMatch[4]!;
    }
  }

  return parts.length > 0 ? parts : text;
}

