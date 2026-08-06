import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { useState, useMemo } from "react";
import logoAsset from "@/assets/logo.png.asset.json";
import { toast } from "sonner";

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
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });

  const [touched, setTouched] = useState({
    fullName: false,
    phone: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  // Brazilian Phone Mask: (00) 00000-0000
  const maskPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const maskedValue = maskPhone(e.target.value);
    setFormData({ ...formData, phone: maskedValue });
  };

  // Validations
  const errors = useMemo(() => {
    const newErrors: Record<string, string> = {};

    if (formData.fullName && formData.fullName.trim().split(" ").length < 2) {
      newErrors["fullName"] = "Digite seu nome completo (nome e sobrenome)";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.email && !emailRegex.test(formData.email)) {
      newErrors["email"] = "E-mail inválido";
    }

    if (formData.password && formData.password.length < 8) {
      newErrors["password"] = "A senha deve ter no mínimo 8 caracteres";
    }

    if (formData.confirmPassword && formData.confirmPassword !== formData.password) {
      newErrors["confirmPassword"] = "As senhas não coincidem";
    }

    return newErrors;
  }, [formData]);

  const isFormValid = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (
      formData.fullName.trim().split(" ").length >= 2 &&
      formData.phone.replace(/\D/g, "").length >= 10 &&
      emailRegex.test(formData.email) &&
      formData.password.length >= 8 &&
      formData.password === formData.confirmPassword &&
      formData.acceptTerms
    );
  }, [formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    toast.info("Cadastro ainda não conectado. Em breve concluiremos esta integração.");
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

      <main className="flex-1 flex flex-col px-6 pb-24">
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              Nome completo
            </label>
            <Input 
              type="text"
              placeholder="Digite seu nome completo"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              onBlur={() => setTouched({ ...touched, fullName: true })}
              className={`bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary ${touched.fullName && errors["fullName"] ? 'border-red-500/50' : ''}`}
            />
            {touched.fullName && errors["fullName"] && (
              <p className="text-[10px] text-red-500 ml-1">{errors["fullName"]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              Telefone celular
            </label>
            <Input 
              type="tel"
              placeholder="(00) 00000-0000"
              value={formData.phone}
              onChange={handlePhoneChange}
              onBlur={() => setTouched({ ...touched, phone: true })}
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
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              onBlur={() => setTouched({ ...touched, email: true })}
              className={`bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary ${touched.email && errors["email"] ? 'border-red-500/50' : ''}`}
            />
            {touched.email && errors["email"] && (
              <p className="text-[10px] text-red-500 ml-1">{errors["email"]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              Senha
            </label>
            <div className="relative">
              <Input 
                type={showPassword ? "text" : "password"}
                placeholder="Mínimo 8 caracteres"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onBlur={() => setTouched({ ...touched, password: true })}
                className={`bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 pr-12 focus:ring-primary focus:border-primary ${touched.password && errors["password"] ? 'border-red-500/50' : ''}`}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {touched.password && errors["password"] && (
              <p className="text-[10px] text-red-500 ml-1">{errors["password"]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 ml-1">
              Confirme a senha
            </label>
            <div className="relative">
              <Input 
                type={showPassword ? "text" : "password"}
                placeholder="Repita sua senha"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                onBlur={() => setTouched({ ...touched, confirmPassword: true })}
                className={`bg-zinc-900/50 border-zinc-800 h-12 rounded-xl text-white placeholder:text-zinc-600 pr-12 focus:ring-primary focus:border-primary ${touched.confirmPassword && errors["confirmPassword"] ? 'border-red-500/50' : ''}`}
              />
            </div>
            {touched.confirmPassword && errors["confirmPassword"] && (
              <p className="text-[10px] text-red-500 ml-1">{errors["confirmPassword"]}</p>
            )}
          </div>

          <div className="flex items-start gap-3 pt-2">
            <Checkbox 
              id="terms" 
              checked={formData.acceptTerms}
              onCheckedChange={(checked) => setFormData({ ...formData, acceptTerms: checked === true })}
              className="mt-1 border-zinc-700 data-[state=checked]:bg-primary data-[state=checked]:text-black" 
            />
            <label htmlFor="terms" className="text-xs text-zinc-400 leading-relaxed">
              Aceito os <span className="text-primary font-bold">Termos de Uso</span> e a <span className="text-primary font-bold">Política de Privacidade</span>.
            </label>
          </div>

          <div className="pt-4 pb-8">
            <Button 
              type="submit"
              disabled={!isFormValid}
              className="w-full bg-primary text-black disabled:bg-zinc-800 disabled:text-zinc-500 hover:bg-primary/90 font-bold h-14 text-lg rounded-2xl transition-all"
            >
              Criar minha conta
            </Button>
          </div>

          <div className="text-center">
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
        </form>
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