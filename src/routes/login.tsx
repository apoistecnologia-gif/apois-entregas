import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: Login,
  head: () => ({
    title: "Login - APOIS ENTREGA",
    meta: [
      { name: "description", content: "Entre na sua conta do APOIS ENTREGA" },
    ],
  }),
});

function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLoading) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("E-mail ou senha inválidos.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.user) {
        // Buscar perfil e papel
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", data.user.id)
          .single();

        if (profileError || !profile) {
          toast.error("Usuário sem perfil cadastrado.");
          return;
        }

        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .single();

        if (roleError || !roleData) {
          toast.error("Usuário sem permissões atribuídas.");
          return;
        }

        toast.success("Login realizado com sucesso!");
        
        // Redirecionar conforme papel
        if (roleData.role === "customer") {
          navigate({ to: "/" }); // Por enquanto volta para a home
        } else {
          toast.error("Acesso não autorizado para este aplicativo.");
        }
      }
    } catch (err) {
      toast.error("Ocorreu um erro ao realizar o login.");
    } finally {
      setIsLoading(false);
    }
  };

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
        {/* Logo and Greeting */}
        <div className="flex flex-col items-center mt-4 mb-10 text-center">
          <img 
            src={logoAsset.url} 
            alt="APOIS ENTREGA" 
            className="h-20 w-auto object-contain mb-6"
          />
          <h1 className="text-2xl font-black text-white leading-tight">
            Que bom ter você de volta
          </h1>
        </div>

        {/* Login Form */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400 ml-1">
              E-mail ou Telefone
            </label>
            <Input 
              type="text"
              placeholder="Digite seu e-mail ou telefone"
              className="bg-zinc-900/50 border-zinc-800 h-14 rounded-2xl text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400 ml-1">
              Senha
            </label>
            <div className="relative">
              <Input 
                type={showPassword ? "text" : "password"}
                placeholder="Sua senha"
                className="bg-zinc-900/50 border-zinc-800 h-14 rounded-2xl text-white placeholder:text-zinc-600 pr-12 focus:ring-primary focus:border-primary"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <Link 
                to="/login" 
                className="text-primary text-sm font-bold hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
          </div>

          <Button className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-14 text-lg rounded-2xl mt-4">
            Entrar
          </Button>

          <div className="text-center pt-8">
            <p className="text-zinc-500 text-sm">
              Ainda não tem uma conta?{" "}
              <Link 
                to="/register" 
                className="text-primary font-bold hover:underline"
              >
                Criar minha conta
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 bg-black border-t border-zinc-900 text-center">
        <p className="text-zinc-600 text-xs font-medium">
          © 2026 APOIS ENTREGA. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}