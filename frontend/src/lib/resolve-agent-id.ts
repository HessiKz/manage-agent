import { fetchAgentBySlug } from "@/lib/api";
import { isAgentUuid } from "@/lib/support-error-text";

/** Resolve API agent id (UUID) from UUID or slug reference. */
export async function resolveAgentId(
  ref: string,
  fallbackSlug?: string
): Promise<string> {
  const trimmed = ref.trim();
  const slugFallback = (fallbackSlug ?? "").trim();

  if (trimmed && isAgentUuid(trimmed)) return trimmed;
  if (slugFallback && isAgentUuid(slugFallback)) return slugFallback;

  const slug = slugFallback || trimmed;
  if (!slug) throw new Error("شناسه ایجنت مشخص نیست");

  const agent = await fetchAgentBySlug(slug);
  return agent.id;
}
