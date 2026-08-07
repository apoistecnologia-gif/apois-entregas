import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppBottomNav } from "@/components/AppBottomNav";

export const Route = createFileRoute("/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button onClick={() => navigate({ to: "/inicio" })} className="p-2 rounded-full bg-zinc-900"><ArrowLeft /></button>
        <h1 className="text-xl font-bold">Meu Perfil</h1>
        <button onClick={() => navigate({ to: "/sacola" })} className="relative p-2 rounded-full bg-zinc-900">
          <ShoppingBag />
          {totalItems > 0 && <span className="absolute -top-1 -right-1 bg-primary text-black text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">{totalItems}</span>}
        </button>
      </header>
      <main className="flex-1 p-6 pb-28">
        <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mb-4 border-2 border-primary"><User className="w-10 h-10 text-primary" /></div>
            <h2 className="text-xl font-bold">{user?.email}</h2>
            <p className="text-zinc-500 text-sm">Cliente Apois</p>
        </div>
      </main>
      <AppBottomNav activeTab="perfil" />
    </div>
  );
}
