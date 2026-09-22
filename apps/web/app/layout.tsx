import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/iam/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "X4G4T // Autonomous Agent Defense Gate",
  description: "Tactical inline AST guardrails, upstream credential vaulting, and tamper-evident audit streams for autonomous AI agents."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkActive = isClerkConfigured();

  const content = (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );

  if (!clerkActive || !publishableKey) {
    return content;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      {content}
    </ClerkProvider>
  );
}

