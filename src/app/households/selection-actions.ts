"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { householdSelectionCookie } from "@/lib/households/selection";

export async function selectHousehold(householdId: string): Promise<{ message: string }> {
  if (!z.uuid().safeParse(householdId).success) return { message: "Choose an available household." };
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { message: "Sign in again to choose a household." };
    // Ordinary authenticated RLS confirms access, including household Members.
    const { data, error } = await supabase.from("households").select("id").eq("id", householdId).is("archived_at", null).maybeSingle();
    if (error || !data) return { message: "That household is unavailable. Reload and try again." };
    const origin = (await headers()).get("origin");
    (await cookies()).set(householdSelectionCookie, data.id, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
      secure: origin ? origin.startsWith("https://") : process.env.NODE_ENV === "production",
    });
    return { message: "" };
  } catch {
    return { message: "Unable to choose a household. Please try again." };
  }
}
