import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { SignInForm } from "./signin-form";

export default async function SignIn() {
  const user = await currentUser();
  if (user) redirect("/drawers");
  return <SignInForm />;
}
