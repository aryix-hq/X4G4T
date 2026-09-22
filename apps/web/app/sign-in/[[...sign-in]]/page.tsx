import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { SignInClient } from "./sign-in-client";

import { isClerkConfigured } from "@/lib/iam/config";

export default async function SignInPage() {
  if (!isClerkConfigured()) {
    redirect("/dashboard");
  }

  try {
    const { userId, sessionId } = await auth();
    if (userId && sessionId) {
      redirect("/dashboard");
    }
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800/80 text-indigo-400 text-xs font-mono mb-3">
            <Shield className="h-3.5 w-3.5" />
            X4G4T Tactical Control Plane
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sign In to X4G4T</h1>
          <p className="text-xs text-slate-400 mt-1">Authenticate to access your organization workspace</p>
        </div>

        <div className="flex justify-center">
          <SignInClient />
        </div>
      </div>
    </div>
  );
}
