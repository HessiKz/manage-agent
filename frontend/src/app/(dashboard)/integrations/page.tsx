import { redirect } from "next/navigation";

export default function IntegrationsPage() {
  redirect("/agents/create?step=api");
}
