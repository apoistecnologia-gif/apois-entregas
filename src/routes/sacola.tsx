import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";

type AddressRow = {
  id: string;
  label: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
};

export const Route = createFileRoute("/sacola")({
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
});

function money(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function SacolaPage() {
  const navigate = useNavigate();
  const { items, merchant, updateQuantity, removeItem, totalPrice } = useCart();
  const [defaultAddress, setDefaultAddress] = useState<AddressRow | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(true);

  useEffect(() => {
    sessionStorage.setItem("apois_payment_method", "pix");

    let active = true;
    const fetchDefaultAddress = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) setLoadingAddress(false);
        return;
      }

      const { data, error } = await supabase
        .from("customer_addresses")
        .select("id,label,street,number,neighborhood,city,state")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (!active) return;
      if (error) console.error("Erro ao carregar endereço padrão:", error.code);
      setDefaultAddress((data ?? null) as AddressRow | null);
      setLoadingAddress(false);
    };

    void fetchDefaultAddress();
    return () => {
      active = false;
    };
  }, []);

  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee ?? 0;
  const total = subtotal + deliveryFee;

  const handleFinishOrder = () => {
    if (items.length === 0) {
      void navigate({ to: "/inicio" });
      return;
    }
    if (!defaultAddress) {
      void navigate({ to: "/enderecos" });
      return;
    }
    sessionStorage.setItem("apois_payment_method", "pix");
    void navigate({ to: "/checkout" });
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
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold">{merchant.name}</h2>
              {merchant.category && <p className="text-sm text-zinc-500">{merchant.category}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px]">
                {merchant.closeTime && (
                  <span className="font-medium text-green-500">Aberto até {merchant.closeTime}</span>
                )}
                {merchant.deliveryTime && <span className="text-zinc-500">{merchant.deliveryTime}</span>}
              </div>
            </div>
          </section>
        )}

        <section className="space-y-1 rounded-2xl border border-zinc-900 bg-zinc-950/50 p-1">
          {items.map((item) => (
            <div
              key={item.lineId}
              className="flex gap-4 border-b border-zinc-900/50 p-3 last:border-0"
            >
              <div className="relative h-20 w-20 shrink-0">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full rounded-xl bg-zinc-900 object-cover ring-1 ring-white/5"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center rounded-xl bg-zinc-900 ring-1 ring-white/10">
                    <Store className="h-6 w-6 text-zinc-800" />
                  </div>
                )}
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-black text-black ring-2 ring-black">
                  {item.quantity}
                </span>
              </div>

              <div className="min-w-0 flex-1 py-0.5">
                <h3 className="text-[15px] font-bold">{item.name}</h3>
                {item.description && (
                  <p className="line-clamp-2 text-[12px] leading-snug text-zinc-500">{item.description}</p>
                )}
                {item.selectedOptions.length > 0 && (
                  <p className="mt-1 line-clamp-2 text-[10px] text-zinc-400">
                    {item.selectedOptions.map((option) => option.optionName).join(" • ")}
                  </p>
                )}
                <p className="mt-2 text-[15px] font-black text-primary">{money(item.price)}</p>
              </div>

              <div className="flex shrink-0 flex-col items-center justify-between py-1">
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
                    className="grid h-6 w-6 place-items-center rounded-md bg-zinc-800 text-zinc-400"
                    aria-label={`Diminuir quantidade de ${item.name}`}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[20px] text-center text-[14px] font-bold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.lineId, 1)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-zinc-800 text-white"
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
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-white/10">
                <Trash2 className="h-10 w-10 text-zinc-700" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Sua sacola está vazia</h3>
                <p className="mt-1 text-sm text-zinc-500">Adicione produtos para começar seu pedido.</p>
              </div>
              <button
                type="button"
                onClick={() => void navigate({ to: "/inicio" })}
                className="rounded-xl bg-primary px-8 py-3 font-bold uppercase text-black"
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
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Taxa de entrega</span>
                <span>{money(deliveryFee)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-900 pt-3 text-lg font-black">
                <span>Total</span>
                <span className="text-xl text-primary">{money(total)}</span>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 shadow-lg">
              <button
                type="button"
                onClick={() => void navigate({ to: "/enderecos" })}
                className="flex w-full items-center gap-4 text-left"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <MapPin className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-zinc-500">Endereço de entrega</p>
                  {loadingAddress ? (
                    <p className="font-bold text-zinc-500">Carregando...</p>
                  ) : defaultAddress ? (
                    <>
                      <p className="truncate font-bold">
                        {defaultAddress.label}: {defaultAddress.street}, {defaultAddress.number}
                      </p>
                      <p className="truncate text-[12px] text-zinc-500">
                        {defaultAddress.neighborhood} · {defaultAddress.city}/{defaultAddress.state}
                      </p>
                    </>
                  ) : (
                    <p className="font-bold text-primary">Selecione um endereço</p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-zinc-700" />
              </button>
            </section>

            <section className="space-y-3 pb-4">
              <h3 className="px-1 text-sm font-bold uppercase tracking-wider text-zinc-500">Pagamento</h3>
              <button
                type="button"
                onClick={() => sessionStorage.setItem("apois_payment_method", "pix")}
                className="flex w-full items-center gap-4 rounded-xl border border-primary bg-primary/5 p-4 text-left text-primary ring-1 ring-primary/30"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10">
                  <CircleDollarSign className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <p className="font-bold">PIX</p>
                  <p className="text-xs text-zinc-500">Pagamento online seguro pela OpenPix/Woovi.</p>
                </div>
                <div className="h-4 w-4 rounded-full border-4 border-primary bg-black" />
              </button>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 text-zinc-700">
                  <CreditCard className="mb-2 h-5 w-5" />
                  <p className="text-sm font-bold">Cartão</p>
                  <p className="mt-1 text-[10px] uppercase">Indisponível</p>
                </div>
                <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4 text-zinc-700">
                  <CircleDollarSign className="mb-2 h-5 w-5" />
                  <p className="text-sm font-bold">Dinheiro</p>
                  <p className="mt-1 text-[10px] uppercase">Indisponível</p>
                </div>
              </div>
              <p className="px-1 text-[11px] leading-relaxed text-zinc-600">
                Outras formas serão habilitadas somente quando a conciliação financeira correspondente estiver configurada.
              </p>
            </section>

            <div className="flex items-center justify-center gap-2 pb-4 text-[11px] text-zinc-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Valores e pagamento são validados no servidor.</span>
            </div>
          </>
        )}
      </main>

      <footer className="sticky bottom-0 z-[60] flex w-full justify-center border-t border-zinc-900 bg-black/90 p-4 pb-8 backdrop-blur-xl">
        <div className="w-full max-w-[500px]">
          <button
            type="button"
            onClick={handleFinishOrder}
            disabled={items.length > 0 && (loadingAddress || !defaultAddress)}
            className="flex w-full items-center justify-between rounded-xl bg-primary px-6 py-4 text-black shadow-[0_8px_30px_rgba(255,215,0,0.3)] transition-transform active:scale-95 disabled:opacity-50"
          >
            <span className="text-lg font-black uppercase tracking-tight">
              {items.length === 0 ? "Escolher produtos" : "Fazer pedido"}
            </span>
            {items.length > 0 && <span className="text-lg font-black">{money(total)}</span>}
          </button>
        </div>
      </footer>
    </div>
  );
}
