"use client";

import { useEffect, useState } from "react";
import { SignIn, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export function SignInClient() {
  const [mounted, setMounted] = useState(false);
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!mounted || (isLoaded && isSignedIn)) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-xs text-slate-400 font-mono">
            {isSignedIn ? "Redirecting to dashboard..." : "Initializing secure authentication..."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <SignIn
      path="/sign-in"
      routing="path"
      forceRedirectUrl="/dashboard"
      fallbackRedirectUrl="/dashboard"
      appearance={{
        elements: {
          footerAction: "hidden",
          footer: "hidden"
        }
      }}
    />
  );
}

