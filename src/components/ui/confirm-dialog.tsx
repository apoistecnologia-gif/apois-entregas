import { useCallback, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmState = { options: ConfirmOptions; resolve: (value: boolean) => void };

/**
 * Drop-in async replacement for window.confirm(). Renders no native dialog,
 * so it never blocks page/WebView script execution.
 *
 *   const { confirm, confirmDialog } = useConfirmDialog();
 *   if (!(await confirm({ title: "Excluir cupom?", destructive: true }))) return;
 *   // ...render {confirmDialog} once in the component tree
 */
export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const close = (value: boolean) => {
    setState((prev) => {
      prev?.resolve(value);
      return null;
    });
  };

  const confirmDialog = state ? (
    <AlertDialog open onOpenChange={(open) => { if (!open) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.options.title}</AlertDialogTitle>
          {state.options.description ? (
            <AlertDialogDescription>{state.options.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {state.options.cancelLabel ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              state.options.destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            onClick={() => close(true)}
          >
            {state.options.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirm, confirmDialog };
}
