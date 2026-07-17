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
          "radial-gradient(ellipse 84% 46% at 62% 24%, rgba(244,238,225,0.48), rgba(244,238,225,0) 66%), linear-gradient(180deg, #C9BEAA 0%, #A99B84 100%)",
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
