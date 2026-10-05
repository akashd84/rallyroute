"use server";
import { discoverMatches } from "@/lib/matching/discovery";
export async function findEventMatches(request: unknown) {
  return discoverMatches(request);
}
