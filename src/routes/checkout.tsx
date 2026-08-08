import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CircleDollarSign, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PaymentMethod = "pix";

type AddressSnapshot = {
  id: string;
  label: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  complement: string | null;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
};

interface CreateOrderResponse {
  orderId: string;
  orderNumber: number;
  createdAt: string;
  status: string;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  observation: string | null;
}

export const Route = createFileRoute("/checkout")({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { session };
  },
  component: CheckoutPage,
});

function getOrCreateRequestKey(): string {
  const storageKey = "apois_checkout_request_key";
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const requestKey = crypto.randomUUID();
  sessionStorage.setItem(storageKey, requestKey);
  return requestKey;
}

function money(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, merchant, totalPrice, clearCart } = useCart();
  const [address, setAddress] = useState<AddressSnapshot | null>(null);
  const [observation, setObservation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) void navigate({ to: "/sacola" });
  }, [items.length, navigate]);

  useEffect(() => {
    sessionStorage.setItem("apois_payment_method", "pix");
    let active = true;

    const fetchDefaultAddress = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("customer_addresses")
        .select(
          "id,label,street,number,neighborhood,city,state,postal_code,complement,reference,latitude,longitude",
        )
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (!active) return;
      if (error) {
        console.error("Erro ao carregar endereço padrão:", error.code);
        setSubmitError("Não foi possível carregar seu endereço. Tente novamente.");
        return;
      }
      setAddress((data ?? null) as AddressSnapshot | null);
    };

    void fetchDefaultAddress();
    return () => {
      active = false;
    };
  }, []);

  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee ?? 0;
  const total = subtotal + deliveryFee;
  const paymentMethod: PaymentMethod = "pix";

  const handleConfirm = async () => {
    if (isSubmitting || !merchant) return;
    setSubmitError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitError("Sua sessão expirou. Entre novamente para confirmar o pedido.");
      return;
    }
    if (!address) {
      setSubmitError("Selecione um endereço de entrega antes de confirmar.");
      return;
    }

    setIsSubmitting(true);
    const requestKey = getOrCreateRequestKey();

    try {
      const { data, error } = await supabase.functions.invoke<CreateOrderResponse>("create-order", {
        body: {
          merchantId: merchant.id,
          requestKey,
          paymentMethod,
          deliveryAddress: { ...address },
          observation: observation.trim() || null,
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            options: item.selectedOptions.map((option) => ({ optionId: option.optionId })),
          })),
        },
      });

      if (error || !data?.orderId) {
        console.error("Falha ao criar pedido real:", error?.name ?? "invalid_response");
        setSubmitError("Não foi possível confirmar o pedido agora. Revise a sacola e tente novamente.");
        return;
      }

      sessionStorage.removeItem("apois_checkout_request_key");
      clearCart();
      void navigate({ to: "/pedido/confirmado", search: { orderId: data.orderId } });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!merchant || items.length === 0) return null;

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center gap-4 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => void navigate({ to: "/sacola" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar para a sacola"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Checkout</h1>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto p-4">
        <button
          type="button"
          onClick={() => void navigate({ to: "/enderecos" })}
          className="w-full rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-left"
        >
          <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Endereço</p>
          <div className="flex items-center gap-3">
            <MapPin className="text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {address ? `${address.street}, ${address.number}` : "Selecione um endereço"}
              </p>
              {address && (
                <p className="truncate text-xs text-zinc-500">
                  {address.neighborhood} · {address.city}/{address.state}
                </p>
              )}
            </div>
          </div>
        </button>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Itens</p>
          {items.map((item) => (
            <div key={item.lineId} className="space-y-1 border-b border-zinc-900 py-2 last:border-0">
              <div className="flex justify-between gap-4 text-sm">
                <span className="font-bold">
                  {item.quantity}x {item.name}
                </span>
                <span className="shrink-0">{money(item.price * item.quantity)}</span>
              </div>
              {item.selectedOptions.length > 0 && (
                <p className="line-clamp-2 text-[10px] text-zinc-500">
                  {item.selectedOptions.map((option) => option.optionName).join(" • ")}
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Pagamento</p>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">PIX</p>
              <p className="text-xs text-zinc-500">A cobrança será gerada pela OpenPix após criar o pedido.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <label
            htmlFor="order-observation"
            className="mb-2 block text-xs font-bold uppercase text-zinc-500"
          >
            Observação
          </label>
          <textarea
            id="order-observation"
            value={observation}
            maxLength={1000}
            onChange={(event) => setObservation(event.target.value)}
            placeholder="Alguma observação para o estabelecimento?"
            className="w-full rounded-xl bg-zinc-900 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </section>

        <section className="space-y-2 text-sm text-zinc-400">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Taxa de entrega</span>
            <span>{money(deliveryFee)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-zinc-900 pt-2 text-lg font-black text-primary">
            <span>Total estimado</span>
            <span>{money(total)}</span>
          </div>
          <div className="flex items-center gap-2 pt-2 text-xs text-zinc-600">
            <ShieldCheck className="h-4 w-4" />
            <span>O servidor recalcula valores, adicionais e disponibilidade antes de gravar o pedido.</span>
          </div>
        </section>

        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200"
          >
            {submitError}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 bg-black p-4">
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={isSubmitting || !address}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-black uppercase text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
          {isSubmitting ? "Criando pedido..." : "Criar pedido e pagar com PIX"}
        </button>
      </footer>
    </div>
  );
}
