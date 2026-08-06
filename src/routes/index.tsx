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
    <div className="flex min-h-screen flex-col bg-background text-foreground overflow-x-hidden">
      {/* Header */}
      <header className="flex items-center justify-between p-4 md:p-6 border-b border-white/10 bg-black sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img 
            src={logoAsset.url} 
            alt="APOIS ENTREGA" 
            className="h-8 md:h-10 w-auto object-contain"
          />
        </div>
        <Button variant="ghost" className="text-white hover:text-primary hover:bg-white/5 text-sm md:text-base">
          Entrar
        </Button>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center bg-black">
        <div className="max-w-2xl w-full">
          <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-tight">
            Tudo o que você precisa, <span className="text-primary italic">agora.</span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl mb-12">
            Escolha como você quer começar hoje no APOIS.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Option 1: Customer */}
            <Card className="bg-zinc-900 border-zinc-800 hover:border-primary transition-all cursor-pointer group">
              <CardContent className="pt-8 pb-6 flex flex-col items-center">
                <div className="p-4 rounded-2xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
                  <ShoppingBag size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Quero pedir</h3>
                <p className="text-sm text-zinc-500 mb-6 px-4">
                  Os melhores restaurantes e lojas na sua mão.
                </p>
                <Button className="w-full bg-primary text-black hover:bg-primary/90 font-bold">
                  Começar
                </Button>
              </CardContent>
            </Card>

            {/* Option 2: Delivery */}
            <Card className="bg-zinc-900 border-zinc-800 hover:border-primary transition-all cursor-pointer group">
              <CardContent className="pt-8 pb-6 flex flex-col items-center">
                <div className="p-4 rounded-2xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
                  <Truck size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Quero entregar</h3>
                <p className="text-sm text-zinc-500 mb-6 px-4">
                  Faça sua própria renda com flexibilidade total.
                </p>
                <Button className="w-full border-primary text-primary hover:bg-primary hover:text-black font-bold" variant="outline">
                  Cadastrar
                </Button>
              </CardContent>
            </Card>

            {/* Option 3: Merchant */}
            <Card className="bg-zinc-900 border-zinc-800 hover:border-primary transition-all cursor-pointer group">
              <CardContent className="pt-8 pb-6 flex flex-col items-center">
                <div className="p-4 rounded-2xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform">
                  <Store size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Quero vender</h3>
                <p className="text-sm text-zinc-500 mb-6 px-4">
                  Sua loja aberta para milhares de clientes.
                </p>
                <Button className="w-full border-primary text-primary hover:bg-primary hover:text-black font-bold" variant="outline">
                  Parceria
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
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
