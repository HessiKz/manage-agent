import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ slug?: string; name?: string }> };

export default async function AgentTestingPage({ searchParams }: Props) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.slug) qs.set("slug", params.slug);
  const query = qs.toString();
  redirect(query ? `/agents/create?${query}` : "/agents/create");
}
