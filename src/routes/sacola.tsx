import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Trash2,
  Minus,
  Plus,
  MapPin,
  ChevronRight,
  CreditCard,
  CircleDollarSign,
  ShieldCheck,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";

export const Route = createFileRoute("/sacola")({
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
  component: SacolaPage,
  head: () => ({ meta: [{ title: "Sacola | APOIS ENTREGA" }] }),
});

function SacolaPage() {
  const navigate = useNavigate();
  const { items, merchant, updateQuantity, removeItem, totalPrice } = useCart();
  const [defaultAddress, setDefaultAddress] = useState<any>(null);

  useEffect(() => {
    sessionStorage.setItem("apois_payment_method", "pix");
    void fetchDefaultAddress();
  }, []);

  const fetchDefaultAddress = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await (supabase as any)
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .single();

    if (data) setDefaultAddress(data);
  };

  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  const handleFinishOrder = () => {
    if (items.length === 0) return;
    if (!defaultAddress) {
      alert("Selecione um endereço de entrega!");
      return;
    }
    sessionStorage.setItem("apois_payment_method", "pix");
    navigate({ to: "/checkout" });
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-black text-white selection:bg-primary selection:text-black">
      <header className="sticky top-0 z-50 flex items-center gap-4 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="grid h-10 w-10 place-items-center rounded-full bg-zinc-900 ring-1 ring-white/10"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-bold">Sacola</h1>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-32">
        {items.length > 0 && merchant && (
          <section className="flex items-center gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 shadow-lg shadow-black/50">
            {merchant.logo ? (
              <img
                src={merchant.logo}
                alt={merchant.name}
                className="h-16 w-16 rounded-xl object-cover ring-1 ring-primary/20"
              />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-xl bg-zinc-900 ring-1 ring-white/10">
                <Store className="h-8 w-8 text-zinc-700" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">{merchant.name}</h2>
              <p className="text-sm text-zinc-500">{merchant.category || ""}</p>
              <div className="mt-1 flex items-center gap-3">
                {merchant.closeTime && (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-green-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Aberto até {merchant.closeTime}
                  </span>
                )}
                {merchant.deliveryTime && (
                  <span className="flex items-center gap-1 text-[12px] text-zinc-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                    {merchant.deliveryTime}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950/50 p-1">
          {items.map((item) => (
            <div
              key={item.lineId}
              className="group relative flex gap-4 border-b border-zinc-900/50 p-3 last:border-0"
            >
              <div className="relative h-20 w-20 shrink-0">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full rounded-xl bg-zinc-900 object-cover ring-1 ring-white/5"
                    onError={(event) => {
                      const image = event.target as HTMLImageElement;
                      image.onerror = null;
                      image.src = "";
                      image.classList.add("hidden");
                      image.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                ) : null}
                <div
                  className={`grid h-full w-full place-items-center rounded-xl bg-zinc-900 ring-1 ring-white/10 ${item.image ? "hidden" : ""}`}
                >
                  <Store className="h-6 w-6 text-zinc-800" />
                </div>
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-black text-black ring-2 ring-black">
                  {item.quantity}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                <div>
                  <h3 className="text-[15px] font-bold text-white">{item.name}</h3>
                  <p className="line-clamp-2 text-[12px] leading-snug text-zinc-500">
                    {item.description}
                  </p>
                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.selectedOptions.map((option, index) => (
                        <span
                          key={`${option.optionId}-${index}`}
                          className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400"
                        >
                          + {option.optionName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[15px] font-black text-primary">
                  R$ {item.price.toFixed(2).replace(".", ",")}
                </p>
              </div>

              <div className="flex flex-col items-center justify-between py-1">
                <button
                  type="button"
                  onClick={() => removeItem(item.lineId)}
                  className="p-1 text-zinc-600 transition-colors hover:text-red-500"
                  aria-label={`Remover ${item.name}`}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-2 rounded-lg bg-zinc-900 p-1 ring-1 ring-white/10">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.lineId, -1)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-zinc-800 text-zinc-400 active:bg-zinc-700"
                    aria-label={`Diminuir quantidade de ${item.name}`}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[20px] text-center text-[14px] font-bold">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.lineId, 1)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-zinc-800 text-white active:bg-zinc-700"
                    aria-label={`Aumentar quantidade de ${item.name}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center space-y-6 py-20 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-900 shadow-2xl ring-1 ring-white/10">
                <Trash2 className="h-10 w-10 text-zinc-700" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white">Sua sacola está vazia</h3>
                <p className="max-w-[200px] text-sm text-zinc-500">
                  Adicione produtos para começar seu pedido
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate({ to: "/inicio" })}
                className="rounded-xl bg-primary px-8 py-3 font-bold uppercase tracking-tight text-black shadow-lg shadow-primary/20 transition-transform active:scale-95"
              >
                Explorar estabelecimentos
              </button>
            </div>
          )}
        </section>

        {items.length > 0 && (
          <>
            <section className="space-y-3 px-1 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>R$ {subtotal.toFixed(2).replace(".", ",")}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <div className="flex items-center gap-1">
                  <span>Taxa de entrega</span>
                  <span className="rounded-full border border-zinc-700 px-1 text-[10px] text-zinc-600">
                    i
                  </span>
                </div>
                <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-900 pt-3 text-lg font-black">
                <span>Total</span>
                <span className="text-xl text-primary">
                  R$ {total.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 shadow-lg">
              <button
                type="button"
                onClick={() => navigate({ to: "/enderecos" })}
                className="group flex w-full items-center gap-4 text-left"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <MapPin className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-zinc-500">Endereço de entrega</p>
                  {defaultAddress ? (
                    <>
                      <p className="line-clamp-1 font-bold text-white">
                        {defaultAddress.label}: {defaultAddress.street}, {defaultAddress.number}
                      </p>
                      {merchant?.deliveryTime && (
                        <p className="text-[12px] text-zinc-500">{merchant.deliveryTime}</p>
                      )}
                    </>
                  ) : (
                    <p className="font-bold text-primary">Selecione um endereço</p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-zinc-700 transition-transform group-active:translate-x-1" />
              </button>
            </section>

            <section className="space-y-3 pb-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                  Pagamento
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                  PIX habilitado
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-primary bg-primary/5 py-4 text-primary shadow-[0_0_15px_rgba(255,215,0,0.15)] ring-1 ring-primary/30">
                  <div className="relative">
                    <CircleDollarSign className="h-6 w-6" />
                    <div className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary ring-2 ring-black">
                      <div className="h-1.5 w-1.5 rounded-full bg-black" />
                    </div>
                  </div>
                  <span className="text-[12px] font-bold">Pix</span>
                </div>

                <button
                  type="button"
                  disabled
                  className="flex cursor-not-allowed flex-col items-center justify-center gap-2 rounded-xl border border-zinc-900 bg-zinc-950 py-4 text-zinc-700 opacity-60"
                  aria-label="Cartão indisponível"
                >
                  <CreditCard className="h-6 w-6" />
                  <span className="text-[12px] font-bold">Cartão</span>
                  <span className="text-[9px] font-black uppercase">Em breve</span>
                </button>

                <button
                  type="button"
                  disabled
                  className="flex cursor-not-allowed flex-col items-center justify-center gap-2 rounded-xl border border-zinc-900 bg-zinc-950 py-4 text-zinc-700 opacity-60"
                  aria-label="Dinheiro indisponível"
                >
                  <CircleDollarSign className="h-6 w-6" />
                  <span className="text-[12px] font-bold">Dinheiro</span>
                  <span className="text-[9px] font-black uppercase">Em breve</span>
                </button>
              </div>
            </section>

            <div className="flex items-center justify-center gap-2 pb-4 text-[11px] text-zinc-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>O pedido só avança após a confirmação do PIX</span>
            </div>
          </>
        )}
      </main>

      <footer className="sticky bottom-0 z-[60] flex w-full justify-center border-t border-zinc-900 bg-black/90 p-4 pb-8 backdrop-blur-xl">
        <div className="w-full max-w-[500px]">
          <button
            type="button"
            onClick={handleFinishOrder}
            className="flex w-full items-center justify-between rounded-xl bg-primary px-6 py-4 text-black shadow-[0_8px_30px_rgba(255,215,0,0.3)] transition-transform active:scale-95"
          >
            <span className="text-lg font-black uppercase tracking-tight">
              {items.length === 0 ? "Escolher produtos" : "Fazer pedido"}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black">R$ {total.toFixed(2).replace(".", ",")}</span>
              <ChevronRight className="h-5 w-5" />
            </div>
          </button>
        </div>
      </footer>
    </div>
  );
}
