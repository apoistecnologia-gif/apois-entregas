import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/register")({
  component: Register,
  head: () => ({
    title: "Criar conta - APOIS ENTREGA",
    meta: [
      { name: "description", content: "Crie sua conta no APOIS ENTREGA" },
    ],
  }),
});

function Register() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white overflow-x-hidden max-w-[500px] mx-auto shadow-2xl border-x border-white/5">
      {/* Header with Back Button */}
      <header className="flex items-center p-4 sticky top-0 z-50 bg-black">
        <button 
          onClick={() => navigate({ to: "/" })}
          className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      </header>

      <main className="flex-1 flex flex-col px-6 pb-12">
        {/* Logo and Title */}
        <div className="flex flex-col items-center mt-2 mb-8 text-center">
          <img 
            src={logoAsset.url} 
            alt="APOIS ENTREGA" 
            className="h-16 w-auto object-contain mb-4"
          />
          <h1 className="text-2xl font-black text-white leading-tight">
            Crie sua conta
          </h1>
        </div>

        {/* Register Form */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              Nome completo
            </label>
            <Input 
              type="text"
              placeholder="Digite seu nome completo"
              className="bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              Telefone celular
            </label>
            <Input 
              type="tel"
              placeholder="(00) 00000-0000"
              className="bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              E-mail
            </label>
            <Input 
              type="email"
              placeholder="seu@email.com"
              className="bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              Senha
            </label>
            <div className="relative">
              <Input 
                type={showPassword ? "text" : "password"}
                placeholder="Crie uma senha"
                className="bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 pr-12 focus:ring-primary focus:border-primary"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              Confirme a senha
            </label>
            <div className="relative">
              <Input 
                type={showPassword ? "text" : "password"}
                placeholder="Repita sua senha"
                className="bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 pr-12 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <div className="flex items-start gap-3 pt-2">
            <Checkbox id="terms" className="mt-1 border-zinc-700 data-[state=checked]:bg-primary data-[state=checked]:text-black" />
            <label htmlFor="terms" className="text-xs text-zinc-400 leading-relaxed">
              Aceito os <Link to="/register" className="text-primary font-bold hover:underline">Termos de Uso</Link> e a <Link to="/register" className="text-primary font-bold hover:underline">Política de Privacidade</Link>.
            </label>
          </div>

          <Button className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-14 text-lg rounded-2xl mt-4">
            Criar minha conta
          </Button>

          <div className="text-center pt-6">
            <p className="text-zinc-500 text-sm">
              Já possui uma conta?{" "}
              <Link 
                to="/login" 
                className="text-primary font-bold hover:underline"
              >
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 bg-black border-t border-zinc-900 text-center">
        <p className="text-zinc-600 text-[10px] font-medium uppercase tracking-wider">
          © 2026 APOIS ENTREGA
        </p>
      </footer>
    </div>
  );
}