import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, CreditCard, Copy, Check, Loader2, QrCode } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LocalAddressSnapshot } from "@/lib/local-orders";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const ACTIVE_PIX_STORAGE_KEY = "apois_active_pix";

type PixData = {
  qrCodeImageUrl: string;
  qrCodeText: string;
  orderId: string;
  total: number;
};

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

async function getFunctionErrorMessage(error: any, fallback: string) {
  try {
    const context = error?.context;
    if (context) {
      const response = typeof context.clone === "function" ? context.clone() : context;
      if (typeof response.json === "function") {
        const payload = await response.json();
        const providerDetail =
          payload?.provider?.message ||
          payload?.provider?.error ||
          payload?.provider?.status_detail ||
          null;

        if (typeof payload?.error === "string" && payload.error.trim()) {
          return providerDetail ? `${payload.error} (${providerDetail})` : payload.error;
        }

        if (typeof payload?.message === "string" && payload.message.trim()) {
          return payload.message;
        }
      }
    }
  } catch {
    // Mantém fallback seguro abaixo.
  }

  return typeof error?.message === "string" && error.message.trim() ? error.message : fallback;
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, merchant, totalPrice, clearCart } = useCart();
  const [address, setAddress] = useState<LocalAddressSnapshot | null>(null);
  const [observation, setObservation] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixData | null>(() => {
    if (typeof window === "undefined") return null;

    try {
      const saved = sessionStorage.getItem(ACTIVE_PIX_STORAGE_KEY);
      if (!saved) return null;

      const parsed = JSON.parse(saved) as Partial<PixData>;
      if (
        typeof parsed.orderId !== "string" ||
        typeof parsed.qrCodeText !== "string" ||
        typeof parsed.qrCodeImageUrl !== "string" ||
        typeof parsed.total !== "number"
      ) {
        sessionStorage.removeItem(ACTIVE_PIX_STORAGE_KEY);
        return null;
      }

      return parsed as PixData;
    } catch {
      sessionStorage.removeItem(ACTIVE_PIX_STORAGE_KEY);
      return null;
    }
  });
  const [copied, setCopied] = useState(false);
  const [requestKey] = useState(() => {
    const saved = sessionStorage.getItem("apois_checkout_request_key");
    if (saved) return saved;

    const newKey = crypto.randomUUID();
    sessionStorage.setItem("apois_checkout_request_key", newKey);
    return newKey;
  });

  const paymentMethod =
    typeof window !== "undefined"
      ? sessionStorage.getItem("apois_payment_method") || "pix"
      : "pix";

  useEffect(() => {
    if (items.length === 0 && !pixData) {
      navigate({ to: "/sacola" });
    }

    void fetchDefaultAddress();
  }, [items, pixData, navigate]);

  useEffect(() => {
    let disposed = false;

    const recoverAlreadyPaidOrder = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || disposed) return;

      const { data, error } = await supabase
        .from("orders" as any)
        .select("id,payment_status")
        .eq("request_key", requestKey)
        .eq("customer_user_id", user.id)
        .maybeSingle();

      if (disposed || error || data?.payment_status !== "paid") return;

      clearCart();
      sessionStorage.removeItem("apois_checkout_request_key");
      sessionStorage.removeItem(ACTIVE_PIX_STORAGE_KEY);
      toast.success("Pagamento confirmado!");
      navigate({
        to: "/pedido/confirmado",
        search: { orderId: data.id },
      });
    };

    void recoverAlreadyPaidOrder();

    return () => {
      disposed = true;
    };
  }, [requestKey, clearCart, navigate]);

  const fetchDefaultAddress = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("customer_addresses" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .single();

    if (data) setAddress(data as any);
  };

  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  const handleCopyPix = () => {
    if (!pixData) return;

    void navigator.clipboard.writeText(pixData.qrCodeText);
    setCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaymentConfirmed = useCallback(() => {
    clearCart();
    sessionStorage.removeItem("apois_checkout_request_key");
    sessionStorage.removeItem(ACTIVE_PIX_STORAGE_KEY);
  }, [clearCart]);

  const handleConfirm = async () => {
    if (isProcessing) return;

    setCheckoutError(null);
    setIsProcessing(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Sua sessão expirou. Entre novamente para finalizar o pedido.");
      }

      if (!address) {
        throw new Error("Selecione um endereço de entrega antes de continuar.");
      }

      if (!merchant?.id) {
        throw new Error("Não foi possível identificar o estabelecimento deste pedido.");
      }

      if (items.length === 0) {
        throw new Error("Sua sacola está vazia.");
      }

      if (paymentMethod !== "pix") {
        throw new Error("No momento, apenas PIX está disponível.");
      }

      const { data: orderResponse, error: orderError } = await supabase.functions.invoke(
        "create-order",
        {
          body: {
            merchantId: merchant.id,
            requestKey,
            paymentMethod: "pix",
            deliveryAddress: address,
            observation,
            items: items.map((item) => ({
              productId: item.id,
              quantity: item.quantity,
              options: item.selectedOptions.map((option) => ({ optionId: option.optionId })),
            })),
          },
        },
      );

      if (orderError) {
        throw new Error(
          await getFunctionErrorMessage(orderError, "Não foi possível criar o pedido."),
        );
      }

      const orderId = orderResponse?.orderId;
      if (!orderId) {
        throw new Error("O backend não retornou o identificador do pedido.");
      }

      const { data: pixResponse, error: pixError } = await supabase.functions.invoke(
        "create-pix-charge",
        { body: { orderId } },
      );

      if (pixError) {
        throw new Error(
          await getFunctionErrorMessage(pixError, "Não foi possível gerar o PIX."),
        );
      }

      const payment = pixResponse?.payment;
      if (!payment?.qrCodeText || !payment?.qrCodeImageUrl) {
        throw new Error("O Mercado Pago não retornou os dados completos do PIX.");
      }

      const nextPixData: PixData = {
        qrCodeImageUrl: payment.qrCodeImageUrl,
        qrCodeText: payment.qrCodeText,
        orderId,
        total: Number(payment.amount) || total,
      };

      setPixData(nextPixData);
      sessionStorage.setItem(ACTIVE_PIX_STORAGE_KEY, JSON.stringify(nextPixData));

      // A sacola permanece intacta enquanto o PIX estiver pendente.
      // Ela só é limpa após o backend confirmar payment_status=paid.
      toast.success("PIX gerado. Aguardando confirmação do pagamento.");
    } catch (error: any) {
      const message =
        typeof error?.message === "string" && error.message.trim()
          ? error.message
          : "Ocorreu um erro ao processar seu pedido. Tente novamente.";

      console.error("Erro no checkout:", error);
      setCheckoutError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (pixData) {
    return (
      <PixPaymentScreen
        pixData={pixData}
        onCopy={handleCopyPix}
        copied={copied}
        total={pixData.total}
        onPaymentConfirmed={handlePaymentConfirmed}
      />
    );
  }

  if (!merchant || items.length === 0) return null;

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center gap-4 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/sacola" })}
          className="rounded-full bg-zinc-900 p-2"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Checkout</h1>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto p-4">
        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Endereço de Entrega</p>
          <div className="flex items-center gap-3">
            <MapPin className="text-primary" />
            <div className="flex-1">
              <p className="font-bold">
                {address ? `${address.street}, ${address.number}` : "Carregando..."}
              </p>
              <p className="text-xs text-zinc-500">{address?.neighborhood}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Itens</p>
          {items.map((item) => (
            <div
              key={item.lineId}
              className="space-y-1 border-b border-zinc-900 py-2 last:border-0"
            >
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
          <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Forma de Pagamento</p>
          <div className="space-y-3">
            <div
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                paymentMethod === "pix"
                  ? "border-primary bg-primary/5"
                  : "border-zinc-900 opacity-50"
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <QrCode className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">PIX</p>
                <p className="text-[10px] font-bold text-primary">DISPONÍVEL</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-zinc-900 p-3 opacity-30 grayscale">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800">
                <CreditCard className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Cartão de Crédito</p>
                <p className="text-[10px] font-bold uppercase text-zinc-500">Em breve</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <textarea
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            placeholder="Alguma observação para o estabelecimento?"
            className="min-h-[80px] w-full rounded-xl bg-zinc-900 p-3 text-sm focus:outline-none"
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
            <span>Total</span>
            <span>R$ {total.toFixed(2).replace(".", ",")}</span>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 bg-black p-4">
        {checkoutError && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-300"
          >
            {checkoutError}
          </div>
        )}

        <Button
          type="button"
          onClick={handleConfirm}
          disabled={isProcessing}
          className="w-full rounded-2xl bg-primary py-7 text-lg font-black uppercase text-black shadow-[0_8px_30px_-10px_hsl(var(--primary)/0.5)]"
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processando...</span>
            </div>
          ) : (
            "Finalizar Pedido"
          )}
        </Button>
      </footer>
    </div>
  );
}

function PixPaymentScreen({
  pixData,
  onCopy,
  copied,
  total,
  onPaymentConfirmed,
}: {
  pixData: { qrCodeImageUrl: string; qrCodeText: string; orderId: string };
  onCopy: () => void;
  copied: boolean;
  total: number;
  onPaymentConfirmed: () => void;
}) {
  const navigate = useNavigate();
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");

  useEffect(() => {
    let disposed = false;
    let completed = false;
    let redirectTimer: number | undefined;
    let pollTimer: number | undefined;

    const finishPayment = () => {
      if (disposed || completed) return;
      completed = true;
      setPaymentStatus("paid");
      onPaymentConfirmed();
      toast.success("Pagamento confirmado!");
      redirectTimer = window.setTimeout(() => {
        navigate({
          to: "/pedido/confirmado",
          search: { orderId: pixData.orderId },
        });
      }, 800);
    };

    const checkCurrentStatus = async () => {
      if (disposed || completed) return;

      const { data, error } = await supabase
        .from("orders" as any)
        .select("payment_status")
        .eq("id", pixData.orderId)
        .maybeSingle();

      if (disposed || completed) return;

      if (error) {
        console.error("Erro ao consultar status do PIX:", error);
        return;
      }

      if (data?.payment_status === "paid") {
        finishPayment();
      }
    };

    const channel = supabase
      .channel(`checkout_payment_${pixData.orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${pixData.orderId}`,
        },
        (payload) => {
          if (payload.new["payment_status"] === "paid") {
            finishPayment();
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void checkCurrentStatus();
        }
      });

    // Realtime continua sendo o caminho principal, mas o polling fecha qualquer
    // janela perdida de evento e também funciona em redes móveis instáveis.
    void checkCurrentStatus();
    pollTimer = window.setInterval(() => {
      void checkCurrentStatus();
    }, 2000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkCurrentStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [pixData.orderId, navigate, onPaymentConfirmed]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-black p-6 text-white">
      <header className="mb-8 mt-4 flex flex-col items-center justify-center space-y-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
          <QrCode className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-black uppercase">Pagamento PIX</h1>
        <p className="text-sm text-zinc-500">Escaneie o código ou copie o código abaixo</p>
      </header>

      <main className="flex flex-1 flex-col items-center space-y-8">
        <div className="rounded-3xl bg-white p-4 shadow-[0_0_40px_rgba(255,215,0,0.2)]">
          <img src={pixData.qrCodeImageUrl} alt="QR Code PIX" className="h-64 w-64" />
        </div>

        <div className="w-full space-y-4">
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Valor total</p>
            <p className="text-3xl font-black text-primary">
              R$ {total.toFixed(2).replace(".", ",")}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Código Copia e Cola</p>
            <div className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
              <p className="flex-1 truncate font-mono text-[10px] text-zinc-400">
                {pixData.qrCodeText}
              </p>
              <button
                type="button"
                onClick={onCopy}
                className="rounded-lg bg-primary p-2 text-black transition-transform active:scale-95"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-8 space-y-3">
        {paymentStatus === "paid" ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <Loader2 className="mb-2 h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase text-primary">
              Pagamento Confirmado! Redirecionando...
            </p>
          </div>
        ) : (
          <>
            <Button
              type="button"
              onClick={onCopy}
              className="h-14 w-full rounded-2xl bg-primary font-black uppercase text-black"
            >
              Copiar código PIX
            </Button>
            <div className="flex flex-col items-center justify-center p-4 text-center text-xs italic text-zinc-500">
              <Loader2 className="mb-2 h-4 w-4 animate-spin opacity-50" />
              <p>Aguardando confirmação do pagamento pelo banco...</p>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
