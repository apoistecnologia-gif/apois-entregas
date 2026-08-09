import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, MessageSquare, Tag, Info, ShoppingBag, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type NotificationSettings = {
  orders: boolean;
  promos: boolean;
  news: boolean;
  app: boolean;
};

const defaultSettings: NotificationSettings = {
  orders: true,
  promos: false,
  news: false,
  app: true,
};

export const Route = createFileRoute("/perfil/notificacoes")({
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
  component: NotificacoesPage,
  head: () => ({ meta: [{ title: "Notificações | APOIS ENTREGA" }] }),
});

function NotificacoesPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof NotificationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const loadPreferences = async () => {
      setLoading(true);
      setLoadError(null);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (disposed) return;
      if (userError || !user) {
        setLoadError("Não foi possível identificar sua sessão.");
        setLoading(false);
        return;
      }

      const { data, error } = await (supabase as any)
        .from("notification_preferences")
        .select("order_updates,promotions,product_news,account_alerts")
        .eq("user_id", user.id)
        .maybeSingle();

      if (disposed) return;

      if (error) {
        console.error("Erro ao carregar preferências de notificação:", error);
        setLoadError("Não foi possível carregar suas preferências agora.");
      } else if (data) {
        setSettings({
          orders: Boolean(data.order_updates),
          promos: Boolean(data.promotions),
          news: Boolean(data.product_news),
          app: Boolean(data.account_alerts),
        });
      }
      setLoading(false);
    };

    void loadPreferences();
    return () => {
      disposed = true;
    };
  }, []);

  const toggle = async (key: keyof NotificationSettings) => {
    if (savingKey) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      toast.error("Sua sessão expirou. Entre novamente.");
      return;
    }

    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSavingKey(key);

    const { error } = await (supabase as any).from("notification_preferences").upsert(
      {
        user_id: user.id,
        order_updates: next.orders,
        promotions: next.promos,
        product_news: next.news,
        account_alerts: next.app,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      console.error("Erro ao salvar preferências de notificação:", error);
      setSettings(settings);
      toast.error("Não foi possível salvar essa preferência.");
    } else {
      toast.success("Preferência atualizada.");
    }
    setSavingKey(null);
  };

  const notificationOptions: Array<{
    id: keyof NotificationSettings;
    label: string;
    description: string;
    icon: typeof ShoppingBag;
    color: string;
  }> = [
    {
      id: "orders",
      label: "Atualizações de pedidos",
      description: "Saiba quando seu pedido for confirmado, sair para entrega ou chegar.",
      icon: ShoppingBag,
      color: "text-primary",
    },
    {
      id: "promos",
      label: "Promoções",
      description: "Receba cupons exclusivos, descontos e ofertas especiais da semana.",
      icon: Tag,
      color: "text-emerald-400",
    },
    {
      id: "news",
      label: "Novidades da APOIS",
      description: "Novos estabelecimentos e funcionalidades em primeira mão.",
      icon: MessageSquare,
      color: "text-blue-400",
    },
    {
      id: "app",
      label: "Notificações do aplicativo",
      description: "Alertas importantes sobre sua conta e segurança.",
      icon: Info,
      color: "text-zinc-400",
    },
  ];

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/perfil" })}
          className="rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Voltar para o perfil"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-300" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Notificações</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 space-y-6 overflow-y-auto p-6">
        <div className="mb-4 flex flex-col items-center justify-center rounded-3xl border border-zinc-900/50 bg-zinc-900/20 p-8">
          <div className="mb-4 rounded-full bg-primary/10 p-4">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm font-bold text-zinc-300">Como prefere ser avisado?</p>
          <p className="mt-2 text-center text-xs text-zinc-500">
            Escolha quais alertas você deseja receber no seu dispositivo.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Carregando preferências...
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center text-sm text-red-300"
          >
            {loadError}
          </div>
        ) : (
          <div className="space-y-4">
            {notificationOptions.map((option) => (
              <div
                key={option.id}
                className="flex items-start justify-between rounded-2xl border border-zinc-900/50 bg-zinc-900/40 p-4 transition-all"
              >
                <div className="flex gap-4">
                  <div
                    className={`shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 ${option.color}`}
                  >
                    <option.icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-zinc-200">{option.label}</p>
                    <p className="pr-4 text-[11px] leading-relaxed text-zinc-500">
                      {option.description}
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <Switch
                    checked={settings[option.id]}
                    disabled={savingKey !== null}
                    onCheckedChange={() => void toggle(option.id)}
                    aria-label={option.label}
                    className="data-[state=checked]:bg-primary"
                  />
                  {savingKey === option.id ? (
                    <Loader2 className="absolute -right-5 top-1 h-3.5 w-3.5 animate-spin text-primary" />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-center">
          <p className="text-[10px] text-zinc-600">
            Dica: você também pode gerenciar as permissões do sistema nas configurações do seu
            celular.
          </p>
        </div>
      </main>
    </div>
  );
}
