 "use client";
 
 import { create } from "zustand";
 
 export type ViewMode = "workspace" | "admin";
 
type UiState = {
  viewMode: ViewMode;
  loggingOut: boolean;
  mobileNavOpen: boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setLoggingOut: (value: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  closeMobileNav: () => void;
};
 
 const STORAGE_KEY = "ma_view_mode";
 
/** Read persisted mode (client-only; call from useEffect after mount). */
export function hydrateViewModeFromStorage(): void {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const mode: ViewMode = raw === "admin" ? "admin" : "workspace";
  useUiStore.getState().setViewMode(mode);
}

export const useUiStore = create<UiState>((set, get) => ({
  viewMode: "workspace",
  loggingOut: false,
  mobileNavOpen: false,
  setViewMode: (mode) => {
     set({ viewMode: mode });
     if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, mode);
   },
  toggleViewMode: () => {
    const next: ViewMode = get().viewMode === "admin" ? "workspace" : "admin";
    get().setViewMode(next);
  },
  setLoggingOut: (value) => set({ loggingOut: value }),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
}));
