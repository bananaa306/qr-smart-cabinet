import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { SignInForm } from "./signin-form";

function safeNextPath(raw: string | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const deep = raw.match(/^\/d\/([^/?#]+)/i);
  if (deep) return `/drawers?open=${encodeURIComponent(decodeURIComponent(deep[1]))}`;
  return raw;
}

/** Plain fallback — do not import client shell components here (that 500s the RSC stream). */
function SignInFallback() {
  return (
    <div
      className="h-dvh"
      style={{
        background:
          "radial-gradient(ellipse 82% 44% at 60% 30%, rgba(255,240,214,0.13), rgba(255,240,214,0) 64%), linear-gradient(180deg, #2C2822 0%, #1D1A16 100%)",
      }}
      role="status"
      aria-label="Loading"
    />
  );
}

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  let user = null;
  try {
    user = await currentUser();
  } catch {
    user = null;
  }

  const params = await searchParams;
  if (user) {
    redirect(safeNextPath(params.next) ?? "/drawers");
  }

  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInForm />
    </Suspense>
  );
}
