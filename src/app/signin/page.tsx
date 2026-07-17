import { Suspense } from "react";
import { SignInForm } from "./signin-form";

/**
 * Plain fallback — never import client shell components here.
 * That previously broke the RSC stream on cold join (digest 1465600122).
 * Auth redirect lives in SignInForm so this page stays static-safe.
 */
function SignInFallback() {
  return (
    <div
      className="h-dvh"
      style={{
        background:
          "radial-gradient(ellipse 86% 48% at 62% 24%, rgba(255,255,250,0.86), rgba(255,255,250,0) 66%), linear-gradient(180deg, #EEE7D8 0%, #DDD2BC 100%)",
      }}
      role="status"
      aria-label="Loading"
    />
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInForm />
    </Suspense>
  );
}
