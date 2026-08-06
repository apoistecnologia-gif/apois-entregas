import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag, Truck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    title: "APOIS ENTREGA - Sua plataforma de pedidos e entregas",
    meta: [
      { name: "description", content: "Peça, entregue ou venda com o APOIS ENTREGA." },
    ],
  }),
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground overflow-x-hidden max-w-[500px] mx-auto shadow-2xl border-x border-white/5">
      {/* Header */}
      <header className="flex items-center justify-between p-4 md:p-6 border-b border-white/10 bg-black sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img 
            src={logoAsset.url} 
            alt="APOIS ENTREGA" 
            className="h-10 md:h-12 w-auto object-contain"
          />
        </div>
        {/* Botão entrar movido para o corpo da página conforme solicitado */}
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center bg-black">
        <div className="w-full space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-black text-white leading-tight">
              Seu pedido, <span className="text-primary italic">do seu jeito</span>
            </h1>
            <p className="text-zinc-400 text-lg">
              Pediu, chegou. Apois, vamo comer?
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full pt-8">
            <Button className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-14 text-lg rounded-2xl">
              Criar minha conta
            </Button>
            
            <Button variant="outline" className="w-full border-zinc-800 text-white hover:bg-white/5 font-bold h-14 text-lg rounded-2xl">
              Entrar
            </Button>

            <button className="text-zinc-500 hover:text-zinc-300 text-sm font-medium mt-4 transition-colors">
              Continuar como visitante
            </button>
          </div>
        </div>
      </main>
      </main>

      {/* Footer */}
      <footer className="py-8 bg-black border-t border-zinc-900 text-center">
        <p className="text-zinc-600 text-sm font-medium">
          © 2026 APOIS ENTREGA. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
