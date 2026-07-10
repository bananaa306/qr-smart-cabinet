import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

// Auth is stubbed for the demo. Rather than a client-side auto-login (which can
// silently hang if a fetch fails), we resolve everything server-side: if a
// session already exists go to /scan, otherwise hand off to the demo-login
// route which sets the cookie and redirects to /scan in one navigation.
// (Production would render the real passkey/OTP sign-in here.)
export default async function SignIn() {
  const user = await currentUser();
  redirect(user ? "/drawers" : "/api/auth/demo-login");
}
