import { useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PromptField = {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  type?: "text" | "number" | "textarea";
  required?: boolean;
  maxLength?: number;
};

export type PromptOptions = {
  title: string;
  description?: ReactNode;
  fields: PromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PromptState = {
  options: PromptOptions;
  values: Record<string, string>;
  resolve: (value: Record<string, string> | null) => void;
};

/**
 * Drop-in async replacement for window.prompt() that supports one or many
 * fields in a single dialog (so a sequence of native prompts collapses into
 * one form instead of N blocking popups). Resolves null on cancel, matching
 * window.prompt()'s cancel semantics.
 *
 *   const { prompt, promptDialog } = usePromptDialog();
 *   const values = await prompt({
 *     title: "Nova categoria",
 *     fields: [{ key: "name", label: "Nome", required: true }],
 *   });
 *   if (!values) return;
 *   const name = values.name.trim();
 *   // ...render {promptDialog} once in the component tree
 */
export function usePromptDialog() {
  const [state, setState] = useState<PromptState | null>(null);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<Record<string, string> | null>((resolve) => {
      const values: Record<string, string> = {};
      for (const field of options.fields) values[field.key] = field.defaultValue ?? "";
      setState({ options, values, resolve });
    });
  }, []);

  const setFieldValue = (key: string, value: string) => {
    setState((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev));
  };

  const close = (value: Record<string, string> | null) => {
    setState((prev) => {
      prev?.resolve(value);
      return null;
    });
  };

  const canSubmit = state
    ? state.options.fields.every((field) => !field.required || state.values[field.key]?.trim())
    : false;

  const promptDialog = state ? (
    <Dialog open onOpenChange={(open) => { if (!open) close(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.options.title}</DialogTitle>
          {state.options.description ? (
            <DialogDescription>{state.options.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-3">
          {state.options.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`prompt-${field.key}`}>
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`prompt-${field.key}`}
                  autoFocus={state.options.fields[0]?.key === field.key}
                  value={state.values[field.key]}
                  onChange={(event) => setFieldValue(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  rows={3}
                />
              ) : (
                <Input
                  id={`prompt-${field.key}`}
                  autoFocus={state.options.fields[0]?.key === field.key}
                  type={field.type === "number" ? "number" : "text"}
                  value={state.values[field.key]}
                  onChange={(event) => setFieldValue(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canSubmit && state.options.fields.length === 1) {
                      close(state.values);
                    }
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(null)}>
            {state.options.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            type="button"
            variant={state.options.destructive ? "destructive" : "default"}
            disabled={!canSubmit}
            onClick={() => close(state.values)}
          >
            {state.options.confirmLabel ?? "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { prompt, promptDialog };
}
