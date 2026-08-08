import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useCart, type CartMerchant } from "@/contexts/CartContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type LocalOrder,
  type LocalOrderItem,
  getLocalOrders,
  saveLocalOrders,
  type LocalAddressSnapshot,
} from "@/lib/local-orders";

const PAYMENT_METHODS = ["pix", "credit", "debit", "cash", "wallet"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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
  items: Array<{
    id: string;
    product_id: string | null;
    product_name: string;
    product_description: string | null;
    base_price: number;
    unit_price: number;
    quantity: number;
    line_total: number;
    selected_options: unknown;
  }>;
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

function getPaymentMethod(): PaymentMethod {
  if (typeof window === "undefined") return "pix";
  const stored = sessionStorage.getItem("apois_payment_method");
  return PAYMENT_METHODS.includes(stored as PaymentMethod) ? (stored as PaymentMethod) : "pix";
}

function getOrCreateRequestKey(): string {
  const storageKey = "apois_checkout_request_key";
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const requestKey = crypto.randomUUID();
  sessionStorage.setItem(storageKey, requestKey);
  return requestKey;
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, merchant, totalPrice, clearCart } = useCart();
  const [address, setAddress] = useState<LocalAddressSnapshot | null>(null);
  const [observation, setObservation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      void navigate({ to: "/sacola" });
    }
  }, [items.length, navigate]);

  useEffect(() => {
    let active = true;

    const fetchDefaultAddress = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (!active) return;
      if (error) {
        console.error("Erro ao carregar endereço padrão:", error.code);
        setSubmitError("Não foi possível carregar seu endereço. Tente novamente.");
        return;
      }

      setAddress(data);
    };

    void fetchDefaultAddress();
    return () => {
      active = false;
    };
  }, []);

  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee ?? 0;
  const total = subtotal + deliveryFee;
  const paymentMethod = getPaymentMethod();

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
        setSubmitError("Não foi possível confirmar o pedido agora. Tente novamente.");
        return;
      }

      // O backend é a fonte de verdade para identificadores e valores financeiros.
      // O snapshot local permanece apenas para compatibilidade com as telas legadas
      // enquanto o histórico passa a consultar diretamente o Supabase.
      const orderItems: LocalOrderItem[] = items.map((item) => ({
        id: item.id,
        lineId: item.lineId,
        name: item.name,
        description: item.description,
        price: item.price,
        basePrice: item.basePrice,
        image: item.image,
        quantity: item.quantity,
        merchantId: item.merchantId,
        selectedOptions: item.selectedOptions.map((option) => ({ ...option })),
      }));

      const newOrder: LocalOrder = {
        id: data.orderId,
        orderNumber: data.orderNumber,
        createdAt: data.createdAt,
        merchant: { ...merchant } as CartMerchant,
        items: orderItems,
        subtotal: Number(data.subtotal),
        deliveryFee: Number(data.deliveryFee),
        discount: Number(data.discount),
        total: Number(data.total),
        address: { ...address },
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
        ...(data.observation ? { observation: data.observation } : {}),
        status: "confirmado",
        backendStatus: data.status,
      };

      const existingOrders = getLocalOrders(user.id).filter((order) => order.id !== data.orderId);
      saveLocalOrders(user.id, [...existingOrders, newOrder]);

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
              <div className="flex justify-between text-sm">
                <span className="font-bold">
                  {item.quantity}x {item.name}
                </span>
                <span>R$ {(item.price * item.quantity).toFixed(2).replace(".", ",")}</span>
              </div>
              {item.selectedOptions.length > 0 && (
                <p className="line-clamp-1 text-[10px] text-zinc-500">
                  {item.selectedOptions.map((option) => option.optionName).join(" • ")}
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Pagamento</p>
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary" />
            <p className="font-bold uppercase">{paymentMethod}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <label htmlFor="order-observation" className="mb-2 block text-xs font-bold uppercase text-zinc-500">
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
            <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
          </div>
          <div className="flex justify-between">
            <span>Taxa de entrega</span>
            <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-zinc-900 pt-2 text-lg font-black text-primary">
            <span>Total estimado</span>
            <span>R$ {total.toFixed(2).replace(".", ",")}</span>
          </div>
          <div className="flex items-center gap-2 pt-2 text-xs text-zinc-600">
            <ShieldCheck className="h-4 w-4" />
            <span>Valores e disponibilidade são confirmados com segurança no servidor.</span>
          </div>
        </section>

        {submitError && (
          <div role="alert" className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
            {submitError}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 bg-black p-4">
        <button
          onClick={() => void handleConfirm()}
          disabled={isSubmitting || !address}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-black uppercase text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
          {isSubmitting ? "Confirmando..." : "Confirmar pedido"}
        </button>
      </footer>
    </div>
  );
}
