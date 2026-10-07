import { GroupInvitationPage } from "@/components/groups/group-invitation-page";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <GroupInvitationPage slug={(await params).slug} kind="share" />;
}
