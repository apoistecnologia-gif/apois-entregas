import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, MessageSquare, Tag, Info, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/perfil/notificacoes")({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: NotificacoesPage,
});

function NotificacoesPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    orders: true,
    promos: true,
    news: false,
    app: true,
  });

  const toggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const notificationOptions = [
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
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden relative">
      <header className="shrink-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button
          onClick={() => navigate({ to: "/perfil" })}
          className="p-2 rounded-full bg-zinc-900 shadow-lg"
        >
          <ArrowLeft className="w-5 h-5 text-zinc-300" />
        </button>
        <h1 className="text-xl font-bold text-primary text-center flex-1">Notificações</h1>
        <div className="w-9" />
      </header>

      <main className="flex-1 overflow-y-auto p-6 scrollbar-none space-y-6">
        <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/20 rounded-3xl border border-zinc-900/50 mb-4">
          <div className="p-4 rounded-full bg-primary/10 mb-4">
            <Bell className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm font-bold text-zinc-300">Como prefere ser avisado?</p>
          <p className="text-xs text-zinc-500 text-center mt-2">
            Escolha quais alertas você deseja receber no seu dispositivo.
          </p>
        </div>

        <div className="space-y-4">
          {notificationOptions.map((option) => (
            <div
              key={option.id}
              className="flex items-start justify-between p-4 rounded-2xl bg-zinc-900/40 border border-zinc-900/50 transition-all"
            >
              <div className="flex gap-4">
                <div
                  className={`p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 shrink-0 ${option.color}`}
                >
                  <option.icon className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-sm text-zinc-200">{option.label}</p>
                  <p className="text-[11px] text-zinc-500 leading-relaxed pr-4">
                    {option.description}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings[option.id as keyof typeof settings]}
                onCheckedChange={() => toggle(option.id as keyof typeof settings)}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          ))}
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-900 text-center">
          <p className="text-[10px] text-zinc-600">
            Dica: Você também pode gerenciar as notificações nas configurações do seu celular.
          </p>
        </div>
      </main>
    </div>
  );
}
