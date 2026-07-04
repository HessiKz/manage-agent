/** Maps snapshot refs (ui-1, ui-2, …) to CSS selectors for the support UI player. */

const registry = new Map<string, string>();

export function setUiRefRegistry(entries: Record<string, string>) {
  registry.clear();
  for (const [ref, selector] of Object.entries(entries)) {
    registry.set(ref, selector);
  }
}

export function resolveUiRef(ref: string): string | undefined {
  return registry.get(ref.trim());
}

export function resolveUiTarget(target: { ref?: string; selector?: string }): string | undefined {
  if (target.ref) {
    const fromRef = resolveUiRef(target.ref);
    if (fromRef) return fromRef;
  }
  return target.selector?.trim() || undefined;
}
