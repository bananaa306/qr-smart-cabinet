import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import {
  buildSmartScreenStyle,
  RooseveltIslandScene,
  SMART_ACCENT,
  smartEspressoTheme,
} from "@/components/smart-shell";
import { SignInForm } from "./signin-form";

function SignInFallback() {
  const t = smartEspressoTheme;
  const accent = SMART_ACCENT;
  return (
    <div className="h-dvh overflow-hidden" style={{ background: t.bg }}>
      <main className="smart-screen" style={buildSmartScreenStyle(t, accent)}>
        <RooseveltIslandScene />
        <div className="smart-screen-body">
          <div className="smart-loading" role="status">
            <span className="spin h-7 w-7 rounded-full border-2" />
            <span>Loading…</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await currentUser();
  const params = await searchParams;
  if (user) {
    const next = params.next;
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      redirect(next);
    }
    redirect("/drawers");
  }
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInForm />
    </Suspense>
  );
}
