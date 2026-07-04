import { logout } from "@/lib/api";
import { setBrandMorphPending } from "@/components/motion/shared";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

export const LOGOUT_TRANSITION_MS = 480;

export function performLogout(router: { push: (href: string) => void }) {
  useUiStore.getState().setLoggingOut(true);
  setBrandMorphPending();

  window.setTimeout(() => {
    logout();
    useAuthStore.getState().clear();
    sessionStorage.removeItem("ma_shell_revealed");
    sessionStorage.removeItem("ma_just_logged_in");
    if (typeof window !== "undefined") {
      sessionStorage.setItem("ma_just_logged_out", "1");
    }
    router.push("/login");
    window.setTimeout(() => {
      useUiStore.getState().setLoggingOut(false);
    }, 50);
  }, LOGOUT_TRANSITION_MS);
}
