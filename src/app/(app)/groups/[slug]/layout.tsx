import { groupContext } from "@/lib/groups/context";

export default async function GroupLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  await groupContext((await params).slug);
  return children;
}
