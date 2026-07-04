export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions (delete, stop deploy) */
  tone?: "default" | "danger";
};

export type AlertDialogOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
};

export type AppDialogApi = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions) => Promise<void>;
};

let api: AppDialogApi | null = null;

export function registerAppDialog(next: AppDialogApi | null) {
  api = next;
}

export async function appConfirm(options: ConfirmDialogOptions): Promise<boolean> {
  if (!api) return false;
  return api.confirm(options);
}

export async function appAlert(options: AlertDialogOptions): Promise<void> {
  if (!api) return;
  return api.alert(options);
}
