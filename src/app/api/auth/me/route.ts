import { NextResponse } from "next/server";
import { seed } from "@/lib/store";
import { currentUser } from "@/lib/session";

export async function GET() {
  seed();
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
}
