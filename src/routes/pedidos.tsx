import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

export const Route = createFileRoute("/pedidos")({
  component: PedidosPage,
});

function PedidosPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();

  return (
    <div className="flex min-h-screen w-full flex-col bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button onClick={() => navigate({ to: "/inicio" })} className="p-2 rounded-full bg-zinc-900"><ArrowLeft /></button>
        <h1 className="text-xl font-bold">Meus Pedidos</h1>
        <button onClick={() => navigate({ to: "/sacola" })} className="relative p-2 rounded-full bg-zinc-900">
          <ShoppingBag />
          {totalItems > 0 && <span className="absolute -top-1 -right-1 bg-primary text-black text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">{totalItems}</span>}
        </button>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-4"><ShoppingBag className="w-8 h-8 text-zinc-600" /></div>
        <h2 className="text-lg font-bold">Nenhum pedido recente</h2>
        <p className="text-zinc-500 text-sm mt-2">Você ainda não realizou pedidos conosco.</p>
      </main>
    </div>
  );
}
