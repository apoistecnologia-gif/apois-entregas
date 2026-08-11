import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  MapPin,
  QrCode,
  Store,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import type { LocalAddressSnapshot } from "@/types/address";
import { toast } from "sonner";

const ACTIVE_PIX_STORAGE_KEY = "apois_active_pix";
const CHECKOUT_ATTEMPT_STORAGE_KEY = "apois_checkout_attempt";
const CHECKOUT_ATTEMPT_TTL_MS = 30 * 60 * 1000;

type PixData = {
  qrCodeImageUrl: string;
  qrCodeText: string;
  orderId: string;
  total: number;
  expiresAt: string | null;
};

type CheckoutAttempt = {
  key: string;
  fingerprint: string;
  createdAt: number;
};

type FulfillmentType = "delivery" | "pickup";

type CouponPreview = {
  coupon_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
};

type MerchantCheckoutConfig = {
  delivery_fee: number | string | null;
  minimum_order: number | string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  address_line: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

type DeliveryQuote = {
  eligible: boolean;
  reason: string;
  zone_id: string | null;
  delivery_fee: number | string;
  minimum_order: number | string;
  distance_km: number | string | null;
};

export const Route = createFileRoute("/checkout")({
  // Supabase Auth persists the customer session in browser storage. Running this guard
  // during SSR makes a hard reload/deep-link look unauthenticated because the server
  // cannot read that browser session. Keep the checkout guard client-side.
  ssr: false,
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
    // Usa a mensagem segura abaixo quando a resposta da função não puder ser lida.
  }

  return typeof error?.message === "string" && error.message.trim() ? error.message : fallback;
}

function loadActivePix(): PixData | null {
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
    return {
      orderId: parsed.orderId,
      qrCodeText: parsed.qrCodeText,
      qrCodeImageUrl: parsed.qrCodeImageUrl,
      total: parsed.total,
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : null,
    };
  } catch {
    sessionStorage.removeItem(ACTIVE_PIX_STORAGE_KEY);
    return null;
  }
}

function checkoutFingerprint(input: {
  merchantId: string;
  paymentMethod: string;
  fulfillmentType: FulfillmentType;
  couponCode: string | null;
  address: LocalAddressSnapshot | null;
  observation: string;
  items: Array<{ id: string; quantity: number; optionIds: string[] }>;
}) {
  return JSON.stringify({
    merchantId: input.merchantId,
    paymentMethod: input.paymentMethod,
    fulfillmentType: input.fulfillmentType,
    couponCode: input.couponCode,
    address: input.fulfillmentType === "delivery" ? input.address : null,
    observation: input.observation.trim(),
    items: [...input.items]
      .map((item) => ({ ...item, optionIds: [...item.optionIds].sort() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function getCheckoutAttempt(fingerprint: string): CheckoutAttempt {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<CheckoutAttempt>;
      const valid =
        typeof saved.key === "string" &&
        typeof saved.fingerprint === "string" &&
        typeof saved.createdAt === "number" &&
        saved.fingerprint === fingerprint &&
        now - saved.createdAt < CHECKOUT_ATTEMPT_TTL_MS;
      if (valid) return saved as CheckoutAttempt;
    }
  } catch {
    // A tentativa será recriada de forma segura abaixo.
  }

  const attempt: CheckoutAttempt = {
    key: crypto.randomUUID(),
    fingerprint,
    createdAt: now,
  };
  sessionStorage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  return attempt;
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, merchant, totalPrice, clearCart, isHydrated } = useCart();
  const [address, setAddress] = useState<LocalAddressSnapshot | null>(null);
  const [merchantConfig, setMerchantConfig] = useState<MerchantCheckoutConfig | null>(null);
  const [serviceFee, setServiceFee] = useState(0);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("delivery");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreview | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [observation, setObservation] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixData | null>(loadActivePix);
  const [copied, setCopied] = useState(false);

  const paymentMethod =
    typeof window !== "undefined" ? sessionStorage.getItem("apois_payment_method") || "pix" : "pix";

  useEffect(() => {
    if (!isHydrated) return;

    if (items.length === 0 && !pixData) {
      navigate({ to: "/sacola" });
      return;
    }

    let disposed = false;
    const fetchDefaultAddress = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || disposed) return;

      const { data } = await supabase
        .from("customer_addresses" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (!disposed && data) setAddress(data as LocalAddressSnapshot);
    };

    void fetchDefaultAddress();
    return () => {
      disposed = true;
    };
  }, [isHydrated, items.length, pixData, navigate]);

  useEffect(() => {
    if (!merchant?.id) return;
    let disposed = false;
    const loadMerchantConfig = async () => {
      const { data, error } = await supabase
        .from("merchants")
        .select(
          "delivery_fee,minimum_order,delivery_enabled,pickup_enabled,address_line,neighborhood,city,state",
        )
        .eq("id", merchant.id)
        .maybeSingle();
      if (disposed) return;
      if (error || !data) {
        console.error("Erro ao carregar modalidades do estabelecimento:", error);
        return;
      }
      const config = data as MerchantCheckoutConfig;
      setMerchantConfig(config);
      if (!config.delivery_enabled && config.pickup_enabled) setFulfillmentType("pickup");
      if (config.delivery_enabled && !config.pickup_enabled) setFulfillmentType("delivery");
    };
    void loadMerchantConfig();
    return () => {
      disposed = true;
    };
  }, [merchant?.id]);

  useEffect(() => {
    if (!merchant?.id) {
      setServiceFee(0);
      return;
    }

    let disposed = false;
    const loadServiceFee = async () => {
      const { data, error } = await (supabase.rpc as any)("preview_checkout_fee", {
        p_merchant_id: merchant.id,
      });
      if (disposed) return;
      if (error) {
        console.error("Erro ao carregar taxa de serviço:", error);
        setServiceFee(0);
        return;
      }
      const value = Number(data ?? 0);
      setServiceFee(Number.isFinite(value) && value >= 0 ? value : 0);
    };

    void loadServiceFee();
    return () => {
      disposed = true;
    };
  }, [merchant?.id]);

  useEffect(() => {
    if (fulfillmentType !== "delivery") {
      setDeliveryQuote(null);
      setDeliveryQuoteLoading(false);
      return;
    }
    if (!merchant?.id || !address) {
      setDeliveryQuote(null);
      setDeliveryQuoteLoading(false);
      return;
    }

    let disposed = false;
    setDeliveryQuoteLoading(true);
    const loadQuote = async () => {
      const { data, error } = await (supabase.rpc as any)("preview_delivery_quote", {
        p_merchant_id: merchant.id,
        p_delivery_address: address,
      });
      if (disposed) return;
      setDeliveryQuoteLoading(false);
      if (error) {
        console.error("Erro ao validar área de entrega:", error);
        setDeliveryQuote({
          eligible: false,
          reason: "validation_failed",
          zone_id: null,
          delivery_fee: 0,
          minimum_order: merchantConfig?.minimum_order ?? 0,
          distance_km: null,
        });
        return;
      }
      const quote = Array.isArray(data) ? data[0] : null;
      setDeliveryQuote(quote ? (quote as DeliveryQuote) : null);
    };
    void loadQuote();
    return () => {
      disposed = true;
    };
  }, [address, fulfillmentType, merchant?.id, merchantConfig?.minimum_order]);

  const subtotal = totalPrice;
  const deliveryFee =
    fulfillmentType === "delivery"
      ? Number(
          deliveryQuote?.eligible
            ? deliveryQuote.delivery_fee
            : (merchantConfig?.delivery_fee ?? merchant?.deliveryFee ?? 0),
        )
      : 0;
  const discount = Number(appliedCoupon?.discount_amount ?? 0);
  const total = Math.max(0, subtotal + deliveryFee + serviceFee - discount);
  const minimumOrder = Number(
    fulfillmentType === "delivery" && deliveryQuote?.eligible
      ? deliveryQuote.minimum_order
      : (merchantConfig?.minimum_order ?? 0),
  );
  const minimumOrderMissing = Math.max(0, minimumOrder - subtotal);
  const deliveryEligible =
    fulfillmentType === "pickup" || Boolean(address && deliveryQuote?.eligible === true);

  const applyCoupon = async () => {
    const normalizedCode = couponInput.trim().toUpperCase();
    if (!merchant?.id || !normalizedCode || couponBusy) return;
    setCouponBusy(true);
    const { data, error } = await (supabase.rpc as any)("preview_coupon", {
      p_merchant_id: merchant.id,
      p_code: normalizedCode,
      p_subtotal: subtotal,
    });
    setCouponBusy(false);
    if (error) {
      setAppliedCoupon(null);
      toast.error(
        String(error.message || "Cupom inválido.")
          .toLowerCase()
          .includes("minimum")
          ? "O valor mínimo necessário para usar este cupom ainda não foi atingido."
          : "Cupom inválido, expirado ou sem usos disponíveis.",
      );
      return;
    }
    const preview = Array.isArray(data) ? data[0] : null;
    if (!preview?.coupon_id) {
      setAppliedCoupon(null);
      toast.error("Este cupom não está disponível.");
      return;
    }
    setAppliedCoupon({
      ...preview,
      discount_value: Number(preview.discount_value),
      discount_amount: Number(preview.discount_amount),
    });
    setCouponInput(String(preview.code || normalizedCode));
    sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    toast.success("Cupom aplicado.");
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
  };

  const handleCopyPix = () => {
    if (!pixData) return;
    void navigator.clipboard.writeText(pixData.qrCodeText);
    setCopied(true);
    toast.success("Código PIX copiado!");
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handlePaymentConfirmed = useCallback(() => {
    clearCart();
    sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
    sessionStorage.removeItem(ACTIVE_PIX_STORAGE_KEY);
  }, [clearCart]);

  const handlePaymentUnavailable = useCallback(() => {
    sessionStorage.removeItem(ACTIVE_PIX_STORAGE_KEY);
    setPixData(null);
  }, []);

  const handleConfirm = async () => {
    if (isProcessing) return;

    setCheckoutError(null);
    setIsProcessing(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user)
        throw new Error("Sua sessão expirou. Entre novamente para finalizar o pedido.");
      if (fulfillmentType === "delivery" && !address)
        throw new Error("Selecione um endereço de entrega antes de continuar.");
      if (fulfillmentType === "delivery" && deliveryQuoteLoading)
        throw new Error("Aguarde a validação da área de entrega.");
      if (fulfillmentType === "delivery" && deliveryQuote?.eligible !== true)
        throw new Error("Este endereço está fora da área de entrega disponível.");
      if (!merchant?.id)
        throw new Error("Não foi possível identificar o estabelecimento deste pedido.");
      if (minimumOrderMissing > 0)
        throw new Error(
          `Faltam R$ ${minimumOrderMissing.toFixed(2).replace(".", ",")} para atingir o pedido mínimo.`,
        );
      if (merchantConfig && fulfillmentType === "delivery" && !merchantConfig.delivery_enabled)
        throw new Error("Este estabelecimento não está aceitando entrega no momento.");
      if (merchantConfig && fulfillmentType === "pickup" && !merchantConfig.pickup_enabled)
        throw new Error("Este estabelecimento não está aceitando retirada no momento.");
      if (items.length === 0) throw new Error("Sua sacola está vazia.");
      if (paymentMethod !== "pix") throw new Error("No momento, apenas PIX está disponível.");

      const fingerprint = checkoutFingerprint({
        merchantId: merchant.id,
        paymentMethod,
        fulfillmentType,
        couponCode: appliedCoupon?.code ?? null,
        address,
        observation,
        items: items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          optionIds: item.selectedOptions.map((option) => option.optionId),
        })),
      });
      const attempt = getCheckoutAttempt(fingerprint);

      const { data: orderResponse, error: orderError } = await supabase.functions.invoke(
        "create-order",
        {
          body: {
            merchantId: merchant.id,
            requestKey: attempt.key,
            paymentMethod: "pix",
            fulfillmentType,
            couponCode: appliedCoupon?.code ?? null,
            deliveryAddress: fulfillmentType === "delivery" ? address : {},
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
      if (!orderId) throw new Error("O backend não retornou o identificador do pedido.");

      const { data: providerSetting } = await (supabase.rpc as any)("get_order_payment_provider");
      const configuredProvider =
        typeof providerSetting === "string" ? providerSetting.trim().toLowerCase() : "mercadopago";
      const pixFunction =
        configuredProvider === "asaas" ? "create-asaas-pix-charge" : "create-pix-charge";
      const { data: pixResponse, error: pixError } = await supabase.functions.invoke(pixFunction, {
        body: { orderId },
      });
      if (pixError) {
        throw new Error(await getFunctionErrorMessage(pixError, "Não foi possível gerar o PIX."));
      }

      const payment = pixResponse?.payment;
      if (!payment?.qrCodeText || !payment?.qrCodeImageUrl) {
        throw new Error("O provedor de pagamento não retornou os dados completos do PIX.");
      }

      const nextPixData: PixData = {
        qrCodeImageUrl: payment.qrCodeImageUrl,
        qrCodeText: payment.qrCodeText,
        orderId,
        total: Number(payment.amount) || Number(orderResponse?.total) || total,
        expiresAt: typeof payment.expiresAt === "string" ? payment.expiresAt : null,
      };
      setPixData(nextPixData);
      sessionStorage.setItem(ACTIVE_PIX_STORAGE_KEY, JSON.stringify(nextPixData));
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

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm font-semibold text-zinc-400">Recuperando seu checkout...</p>
        </div>
      </div>
    );
  }

  if (pixData) {
    return (
      <PixPaymentScreen
        pixData={pixData}
        onCopy={handleCopyPix}
        copied={copied}
        total={pixData.total}
        onPaymentConfirmed={handlePaymentConfirmed}
        onPaymentUnavailable={handlePaymentUnavailable}
      />
    );
  }

  if (!merchant || items.length === 0) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm font-semibold text-zinc-400">Voltando para sua sacola...</p>
        </div>
      </div>
    );
  }

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
          <p className="mb-3 text-xs font-bold uppercase text-zinc-500">Como você quer receber?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={merchantConfig?.delivery_enabled === false}
              onClick={() => {
                setFulfillmentType("delivery");
                sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
              }}
              className={`flex items-center gap-2 rounded-xl border p-3 text-left ${
                fulfillmentType === "delivery"
                  ? "border-primary bg-primary/5 text-white"
                  : "border-zinc-900 text-zinc-500"
              } disabled:cursor-not-allowed disabled:opacity-30`}
            >
              <Truck className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold">Entrega</span>
            </button>
            <button
              type="button"
              disabled={merchantConfig?.pickup_enabled === false}
              onClick={() => {
                setFulfillmentType("pickup");
                setDeliveryQuote(null);
                sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
              }}
              className={`flex items-center gap-2 rounded-xl border p-3 text-left ${
                fulfillmentType === "pickup"
                  ? "border-primary bg-primary/5 text-white"
                  : "border-zinc-900 text-zinc-500"
              } disabled:cursor-not-allowed disabled:opacity-30`}
            >
              <Store className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold">Retirada</span>
            </button>
          </div>
        </section>

        {fulfillmentType === "delivery" ? (
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase text-zinc-500">Endereço de entrega</p>
              <button
                type="button"
                onClick={() => navigate({ to: "/enderecos" })}
                className="text-xs font-bold text-primary"
              >
                Alterar
              </button>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="text-primary" />
              <div className="flex-1">
                <p className="font-bold">
                  {address
                    ? `${address.street}, ${address.number}`
                    : "Nenhum endereço padrão selecionado"}
                </p>
                <p className="text-xs text-zinc-500">{address?.neighborhood}</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Store className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-bold">Retirada no estabelecimento</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {[
                    merchantConfig?.address_line,
                    merchantConfig?.neighborhood,
                    [merchantConfig?.city, merchantConfig?.state].filter(Boolean).join(" - "),
                  ]
                    .filter(Boolean)
                    .join(" · ") ||
                    "O endereço de retirada será exibido no acompanhamento do pedido."}
                </p>
              </div>
            </div>
          </section>
        )}

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
          <div className="mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            <p className="text-xs font-bold uppercase text-zinc-500">Cupom de desconto</p>
          </div>
          {appliedCoupon ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div>
                <p className="text-sm font-black text-emerald-300">{appliedCoupon.code}</p>
                <p className="text-xs text-zinc-500">
                  Desconto de R$ {discount.toFixed(2).replace(".", ",")} aplicado
                </p>
              </div>
              <button
                type="button"
                onClick={removeCoupon}
                className="rounded-full bg-zinc-900 p-2 text-zinc-400"
                aria-label="Remover cupom"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={couponInput}
                maxLength={80}
                onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void applyCoupon();
                  }
                }}
                className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm font-bold uppercase outline-none focus:border-primary"
                placeholder="Digite o código"
              />
              <Button
                type="button"
                variant="outline"
                disabled={couponBusy || !couponInput.trim()}
                onClick={() => void applyCoupon()}
                className="border-zinc-800"
              >
                {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <p className="mb-2 text-xs font-bold uppercase text-zinc-500">Forma de Pagamento</p>
          <div className="space-y-3">
            <div
              className={`flex items-center gap-3 rounded-xl border p-3 ${paymentMethod === "pix" ? "border-primary bg-primary/5" : "border-zinc-900 opacity-50"}`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <QrCode className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">PIX</p>
                <p className="text-[10px] font-bold text-primary">DISPONÍVEL</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <textarea
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            maxLength={1000}
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
            <span>{fulfillmentType === "delivery" ? "Taxa de entrega" : "Retirada"}</span>
            <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
          </div>
          {serviceFee > 0 ? (
            <div className="flex justify-between">
              <span>Taxa de serviço</span>
              <span>R$ {serviceFee.toFixed(2).replace(".", ",")}</span>
            </div>
          ) : null}
          {fulfillmentType === "delivery" && address ? (
            <div
              role="status"
              className={`rounded-xl p-3 text-xs ${
                deliveryQuoteLoading
                  ? "bg-zinc-900 text-zinc-400"
                  : deliveryQuote?.eligible
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-red-500/10 text-red-300"
              }`}
            >
              {deliveryQuoteLoading
                ? "Validando área e taxa de entrega..."
                : deliveryQuote?.eligible
                  ? `${deliveryQuote.zone_id ? "Endereço dentro da zona de entrega" : "Endereço atendido"}${
                      deliveryQuote.distance_km !== null
                        ? ` · ${Number(deliveryQuote.distance_km).toFixed(1).replace(".", ",")} km`
                        : ""
                    }`
                  : deliveryQuote?.reason === "outside_served_city"
                    ? "Este estabelecimento não entrega na cidade deste endereço."
                    : deliveryQuote?.reason === "outside_delivery_zone" ||
                        deliveryQuote?.reason === "outside_default_radius"
                      ? "Este endereço está fora da área de entrega disponível."
                      : deliveryQuote?.reason === "merchant_location_required"
                        ? "O estabelecimento precisa confirmar a localização da loja antes de liberar entregas."
                        : deliveryQuote?.reason === "coordinates_required"
                          ? "Precisamos localizar este endereço com precisão para calcular a entrega. Toque em Alterar, edite o endereço e marque o ponto no mapa."
                          : "Não foi possível validar a área de entrega agora."}
            </div>
          ) : null}
          {discount > 0 ? (
            <div className="flex justify-between text-emerald-400">
              <span>Desconto</span>
              <span>- R$ {discount.toFixed(2).replace(".", ",")}</span>
            </div>
          ) : null}
          {minimumOrder > 0 ? (
            <div
              className={`rounded-xl p-3 text-xs ${minimumOrderMissing > 0 ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}
            >
              {minimumOrderMissing > 0
                ? `Faltam R$ ${minimumOrderMissing.toFixed(2).replace(".", ",")} para o pedido mínimo de R$ ${minimumOrder.toFixed(2).replace(".", ",")}.`
                : `Pedido mínimo de R$ ${minimumOrder.toFixed(2).replace(".", ",")} atingido.`}
            </div>
          ) : null}
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
          disabled={
            isProcessing || minimumOrderMissing > 0 || deliveryQuoteLoading || !deliveryEligible
          }
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
  onPaymentUnavailable,
}: {
  pixData: PixData;
  onCopy: () => void;
  copied: boolean;
  total: number;
  onPaymentConfirmed: () => void;
  onPaymentUnavailable: () => void;
}) {
  const navigate = useNavigate();
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");

  useEffect(() => {
    let disposed = false;
    let completed = false;
    let redirectTimer: number | undefined;

    const finishPayment = () => {
      if (disposed || completed) return;
      completed = true;
      setPaymentStatus("paid");
      onPaymentConfirmed();
      toast.success("Pagamento confirmado!");
      redirectTimer = window.setTimeout(() => {
        navigate({ to: "/pedido/confirmado", search: { orderId: pixData.orderId } });
      }, 650);
    };

    const readDatabaseStatus = async () => {
      const { data, error } = await supabase
        .from("orders" as any)
        .select("payment_status")
        .eq("id", pixData.orderId)
        .maybeSingle();
      if (disposed || completed || error) return;
      const status = data?.payment_status;
      if (status === "paid") finishPayment();
      else if (["failed", "refunded"].includes(status)) setPaymentStatus(status);
      else if (status === "processing") setPaymentStatus("processing");
    };

    const reconcileWithProvider = async () => {
      if (disposed || completed) return;
      const { data, error } = await supabase.functions.invoke("sync-payment-status", {
        body: { orderId: pixData.orderId },
      });
      if (disposed || completed) return;

      if (!error) {
        const status = data?.paymentStatus;
        if (status === "paid") {
          finishPayment();
          return;
        }
        if (["failed", "refunded"].includes(status)) setPaymentStatus(status);
        else if (status === "processing") setPaymentStatus("processing");
      }
      await readDatabaseStatus();
    };

    const channel = supabase
      .channel(`checkout_payment_${pixData.orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${pixData.orderId}` },
        (payload) => {
          const status = payload.new["payment_status"];
          if (status === "paid") finishPayment();
          else if (["failed", "refunded"].includes(status)) setPaymentStatus(status);
          else if (status === "processing") setPaymentStatus("processing");
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void reconcileWithProvider();
      });

    void reconcileWithProvider();
    const reconcileTimer = window.setInterval(() => void reconcileWithProvider(), 4000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void reconcileWithProvider();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
      if (reconcileTimer !== undefined) window.clearInterval(reconcileTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [pixData.orderId, navigate, onPaymentConfirmed]);

  const expiredLocally = Boolean(
    pixData.expiresAt && new Date(pixData.expiresAt).getTime() <= Date.now(),
  );
  const unavailable = ["failed", "refunded"].includes(paymentStatus) || expiredLocally;

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
        ) : unavailable ? (
          <div className="space-y-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center">
            <p className="text-sm font-bold text-red-300">
              {paymentStatus === "refunded"
                ? "Este pagamento foi estornado."
                : "Este PIX não está mais disponível."}
            </p>
            {paymentStatus !== "refunded" && (
              <Button
                type="button"
                onClick={onPaymentUnavailable}
                className="h-12 w-full rounded-xl bg-primary font-black uppercase text-black"
              >
                Gerar novo PIX
              </Button>
            )}
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
              <p>
                {paymentStatus === "processing"
                  ? "Pagamento em processamento..."
                  : "Aguardando confirmação do pagamento pelo banco..."}
              </p>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
