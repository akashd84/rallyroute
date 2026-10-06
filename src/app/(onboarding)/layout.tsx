import { accountContext } from "@/lib/households/context";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await accountContext();
  return children;
}
