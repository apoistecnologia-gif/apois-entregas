import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  CircleAlert,
  Loader2,
  MessageSquare,
  PackageCheck,
  Tag,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/notificacoes")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { session };
  },
  component: NotificationCenterPage,
  head: () => ({ meta: [{ title: "Notificações | APOIS ENTREGA" }] }),
});

type NotificationRow = Record<string, unknown> & {
  id: string;
  created_at?: string;
  title?: string;
  body?: string;
  message?: string;
  type?: string;
  category?: string;
  status?: string;
  is_read?: boolean;
  read_at?: string | null;
};

const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});

function isUnread(notification: NotificationRow) {
  if ("read_at" in notification) return !notification.read_at;
  if ("is_read" in notification) return notification.is_read !== true;
  if ("status" in notification) return notification.status !== "read";
  return false;
}

function displayTitle(notification: NotificationRow) {
  const title = typeof notification.title === "string" ? notification.title.trim() : "";
  if (title) return title;
  const type = String(notification.type || notification.category || "Atualização").replaceAll(
    "_",
    " ",
  );
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function displayBody(notification: NotificationRow) {
  if (typeof notification.body === "string" && notification.body.trim()) return notification.body;
  if (typeof notification.message === "string" && notification.message.trim())
    return notification.message;
  const data = notification["data"] ?? notification["payload"];
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidate = record["message"] ?? record["body"] ?? record["description"];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "Há uma nova atualização disponível na sua conta.";
}

function NotificationIcon({ notification }: { notification: NotificationRow }) {
  const type = String(notification.type || notification.category || "").toLowerCase();
  if (type.includes("order") || type.includes("delivery"))
    return <PackageCheck className="h-5 w-5" />;
  if (type.includes("support")) return <MessageSquare className="h-5 w-5" />;
  if (type.includes("promo") || type.includes("coupon")) return <Tag className="h-5 w-5" />;
  if (type.includes("critical") || type.includes("alert"))
    return <CircleAlert className="h-5 w-5" />;
  return <Bell className="h-5 w-5" />;
}

function NotificationCenterPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadNotifications = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setErrorMessage(null);
    const { data, error } = await rpc("get_my_notification_feed", { _limit: 100 });
    if (error) {
      console.error("Erro ao carregar notificações:", error);
      setErrorMessage("Não foi possível carregar suas notificações agora.");
      if (!quiet) setNotifications([]);
    } else {
      setNotifications(Array.isArray(data) ? (data as NotificationRow[]) : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadNotifications();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;

    const subscribe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || disposed) return;
      channel = supabase
        .channel(`my_notifications_${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => void loadNotifications(true),
        )
        .subscribe();
    };

    void subscribe();
    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

  const unreadCount = useMemo(
    () =>
      notifications.reduce((total, notification) => total + (isUnread(notification) ? 1 : 0), 0),
    [notifications],
  );

  const markOne = async (notification: NotificationRow) => {
    if (!isUnread(notification) || busyId) return;
    setBusyId(notification.id);
    const { error } = await rpc("read_my_notification", { _notification_id: notification.id });
    setBusyId(null);
    if (error) {
      toast.error("Não foi possível marcar a notificação como lida.");
      return;
    }
    await loadNotifications(true);
  };

  const markAll = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    const { error } = await rpc("read_all_my_notifications");
    setMarkingAll(false);
    if (error) {
      toast.error("Não foi possível marcar todas como lidas.");
      return;
    }
    toast.success("Notificações marcadas como lidas.");
    await loadNotifications(true);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-zinc-900 bg-black/90 p-4 backdrop-blur">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1 ? window.history.back() : navigate({ to: "/perfil" })
          }
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-black">Notificações</h1>
          <p className="text-xs text-zinc-500">
            {unreadCount === 0
              ? "Nenhuma atualização pendente"
              : `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          disabled={markingAll || unreadCount === 0}
          onClick={() => void markAll()}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 disabled:opacity-30"
        >
          {markingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4" />
          )}
          Ler todas
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4 pb-24">
        {loading ? (
          <div
            className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500"
            role="status"
          >
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Carregando notificações...
          </div>
        ) : errorMessage ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300"
          >
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="mt-3 font-bold underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-zinc-700" />
            <h2 className="mt-3 font-black">Nenhuma notificação</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Atualizações de pedidos, suporte e comunicações permitidas aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const unread = isUnread(notification);
              return (
                <button
                  key={notification.id}
                  type="button"
                  disabled={busyId === notification.id}
                  onClick={() => void markOne(notification)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                    unread ? "border-primary/20 bg-primary/5" : "border-zinc-900 bg-zinc-950"
                  } disabled:opacity-60`}
                >
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${unread ? "bg-primary text-black" : "bg-zinc-900 text-zinc-500"}`}
                  >
                    {busyId === notification.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <NotificationIcon notification={notification} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className={`text-sm ${unread ? "font-black text-white" : "font-bold text-zinc-300"}`}
                      >
                        {displayTitle(notification)}
                      </p>
                      {unread ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      {displayBody(notification)}
                    </p>
                    {notification.created_at ? (
                      <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-700">
                        {new Date(notification.created_at).toLocaleString("pt-BR")}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
