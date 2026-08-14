import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  MessageSquareText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;

export function CourierCompletionSheet({ job, onDone }: { job: any; onDone: () => void }) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="relative -mt-8 overflow-hidden rounded-t-[2rem] rounded-b-[1.8rem] border border-primary/35 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.13),transparent_40%),linear-gradient(180deg,#10100d,#070707)] px-5 pb-5 pt-3 text-center shadow-[0_-18px_45px_rgba(0,0,0,0.65)]"
    >
      <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-700" />
      <div className="mx-auto mt-6 grid h-16 w-16 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_35px_rgba(34,197,94,0.1)]">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
        Entrega concluída
      </p>
      <h2 className="mt-1 text-2xl font-black">Tudo certo!</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-zinc-500">
        O pedido #{job?.orders?.order_number ?? "—"} foi confirmado com o PIN do cliente.
      </p>
      <div className="mx-auto mt-5 flex max-w-xs items-center justify-between rounded-2xl border border-primary/20 bg-black/65 p-4 text-left">
        <div>
          <p className="text-[9px] font-black uppercase text-zinc-600">Ganho estimado</p>
          <p className="mt-1 text-xl font-black text-primary">{money(job?.estimated_earnings)}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-black">
          <CircleDollarSign className="h-5 w-5" />
        </div>
      </div>
      <Button
        onClick={onDone}
        className="mt-5 h-14 w-full rounded-2xl font-black uppercase tracking-[0.05em]"
      >
        Voltar ao início
      </Button>
    </section>
  );
}

export function CourierSupportSheet({
  open,
  value,
  onChange,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1600] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="courier-support-title"
        className="w-full max-w-lg rounded-[2rem] border border-primary/30 bg-[#090909] p-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-white shadow-[0_-20px_70px_rgba(0,0,0,0.75)]"
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-700" />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                Ajuda durante a entrega
              </p>
              <h2 id="courier-support-title" className="mt-1 text-lg font-black">
                Relatar um problema
              </h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Explique o que aconteceu. O chamado ficará vinculado a esta entrega.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-800 bg-black text-zinc-400 disabled:opacity-50"
            aria-label="Fechar suporte"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={10}
          maxLength={1000}
          rows={5}
          autoFocus
          placeholder="Descreva o problema com pelo menos 10 caracteres..."
          className="mt-4 w-full resize-none rounded-2xl border border-zinc-800 bg-black p-4 text-sm leading-5 text-white outline-none placeholder:text-zinc-600 focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-zinc-600">
          <span>Não inclua senhas ou dados bancários.</span>
          <span>{value.length}/1000</span>
        </div>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={busy || value.trim().length < 10}
          className="mt-4 h-14 w-full rounded-2xl font-black uppercase tracking-[0.04em]"
        >
          {busy ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <MessageSquareText className="mr-2 h-5 w-5" />
          )}
          {busy ? "Abrindo chamado..." : "Enviar para o suporte"}
        </Button>
      </section>
    </div>
  );
}
