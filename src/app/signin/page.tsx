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
          "radial-gradient(ellipse 82% 44% at 60% 30%, rgba(255,240,214,0.13), rgba(255,240,214,0) 64%), linear-gradient(180deg, #2C2822 0%, #1D1A16 100%)",
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
