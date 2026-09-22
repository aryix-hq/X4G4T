"use client";

import { UserButton } from "@clerk/nextjs";

export function UserProfileButton() {
  return <UserButton afterSignOutUrl="/sign-in" />;
}

