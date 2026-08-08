import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  Info,
  Loader2,
  MessageSquare,
  ShoppingBag,
  Tag,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/perfil/notificacoes")({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { session };
  },
  component: NotificacoesPage,
});

type Preferences = {
  order_updates: boolean;
  promotions: boolean;
  product_news: boolean;
  account_alerts: boolean;
};

type NotificationItem = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type GetResponse = {
  preferences: Preferences;
  notifications: NotificationItem[];
};

type SaveResponse = { saved: boolean };
type ReadResponse = { read: boolean };

type FunctionErrorBody = { error?: string };

const defaultPreferences: Preferences = {
  order_updates: true,
  promotions: false,
  product_news: false,
  account_alerts: true,
};

async function invokeNotifications<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("customer-notifications", { body });
  if (error || !data) {
    let message = "Não foi possível atualizar as notificações.";
    const context = error?.context;
    if (context instanceof Response) {
      try {
        const payload = (await context.clone().json()) as FunctionErrorBody;
        if (payload.error) message = payload.error;
      } catch {
        // Keep fallback.
      }
    }
    throw new Error(message);
  }
  return data;
}

function NotificacoesPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Preferences>(defaultPreferences);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await invokeNotifications<GetResponse>({ action: "get" });
      setSettings(result.preferences);
      setNotifications(result.notifications);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as notificações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("customer-notifications-screen")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const toggle = async (key: keyof Preferences) => {
    if (savingKey) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSavingKey(key);
    setError(null);
    try {
      await invokeNotifications<SaveResponse>({ action: "save", settings: next });
    } catch (saveError) {
      setSettings(settings);
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar sua preferência.");
    } finally {
      setSavingKey(null);
    }
  };

  const markRead = async (notification: NotificationItem) => {
    if (notification.read_at) return;
    try {
      await invokeNotifications<ReadResponse>({ action: "read", notificationId: notification.id });
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item,
        ),
      );
    } catch {
      // Reading is non-destructive; keep the item unread if the request fails.
    }
  };

  const notificationOptions: Array<{
    id: keyof Preferences;
    label: string;
    description: string;
    icon: typeof Bell;
    color: string;
  }> = [
    {
      id: "order_updates",
      label: "Atualizações de pedidos",
      description: "Preferência para avisos de confirmação, preparo e entrega.",
      icon: ShoppingBag,
      color: "text-primary",
    },
    {
      id: "promotions",
      label: "Promoções",
      description: "Ofertas e campanhas comerciais quando esse canal estiver ativo.",
      icon: Tag,
      color: "text-emerald-400",
    },
    {
      id: "product_news",
      label: "Novidades da APOIS",
      description: "Novos estabelecimentos e funcionalidades da plataforma.",
      icon: MessageSquare,
      color: "text-blue-400",
    },
    {
      id: "account_alerts",
      label: "Alertas da conta",
      description: "Preferência para alertas operacionais e de segurança.",
      icon: Info,
      color: "text-zinc-400",
    },
  ];

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => void navigate({ to: "/perfil" })}
          className="rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Voltar ao perfil"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-300" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Notificações</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 space-y-7 overflow-y-auto p-6">
        <section className="flex flex-col items-center justify-center rounded-3xl border border-zinc-900/50 bg-zinc-900/20 p-7 text-center">
          <div className="mb-3 rounded-full bg-primary/10 p-4">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm font-bold text-zinc-300">Preferências salvas na sua conta</p>
          <p className="mt-2 text-xs text-zinc-500">
            Essas opções acompanham sua conta mesmo quando você troca de aparelho.
          </p>
        </section>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-primary">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        ) : (
          <>
            {error && (
              <div role="alert" className="rounded-xl border border-red-950 bg-red-950/20 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <section className="space-y-4">
              {notificationOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex items-start justify-between rounded-2xl border border-zinc-900/50 bg-zinc-900/40 p-4"
                >
                  <div className="flex gap-4">
                    <div className={`shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 ${option.color}`}>
                      <option.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1 pr-3">
                      <p className="text-sm font-bold text-zinc-200">{option.label}</p>
                      <p className="text-[11px] leading-relaxed text-zinc-500">{option.description}</p>
                    </div>
                  </div>
                  <div className="flex h-7 items-center">
                    {savingKey === option.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Switch
                        checked={settings[option.id]}
                        onCheckedChange={() => void toggle(option.id)}
                        className="data-[state=checked]:bg-primary"
                      />
                    )}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-widest text-primary">Alertas recentes</h2>
                <span className="text-[10px] text-zinc-600">{notifications.filter((item) => !item.read_at).length} não lidos</span>
              </div>
              {notifications.length === 0 ? (
                <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-center text-xs text-zinc-600">
                  Nenhum alerta na sua conta ainda.
                </div>
              ) : (
                notifications.map((notification) => (
                  <button
                    type="button"
                    key={notification.id}
                    onClick={() => void markRead(notification)}
                    className={`w-full rounded-2xl border p-4 text-left ${
                      notification.read_at
                        ? "border-zinc-900 bg-zinc-950/60"
                        : "border-primary/20 bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold">{notification.title}</p>
                      {!notification.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{notification.body}</p>
                    <p className="mt-2 text-[10px] text-zinc-700">
                      {new Date(notification.created_at).toLocaleString("pt-BR")}
                    </p>
                  </button>
                ))
              )}
            </section>
          </>
        )}

        <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-center">
          <p className="text-[10px] text-zinc-600">
            O sistema operacional do celular também pode bloquear notificações. O push nativo será ativado quando o provedor mobile estiver configurado.
          </p>
        </div>
      </main>
    </div>
  );
}
