import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";
import { APOIS_OFFICIAL_RED_LOGO_URL } from "@/assets/apoisOfficial2026";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode, getProductHomeRoute, getProductLabel } from "@/lib/product-routing";

export const Route = createFileRoute("/register")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) throw redirect({ to: getProductHomeRoute() });
  },
  component: Register,
  head: () => ({
    title: `Criar conta - ${getProductLabel()}`,
    meta: [{ name: "description", content: `Crie sua conta no ${getProductLabel()}` }],
  }),
});

const onlyDigits = (value: string) => value.replace(/\D/g, "");

type FieldName =
  "fullName" | "phone" | "cpf" | "birthDate" | "email" | "password" | "confirmPassword";
type FormErrors = Partial<Record<FieldName, string>>;

const maskPhone = (value: string) => {
  const numbers = onlyDigits(value).slice(0, 11);
  if (numbers.length <= 2) return numbers;
  if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
};

const maskCpf = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const isValidCpf = (value: string) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
};

const maskBirthDate = (value: string) => {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const birthDateToIso = (value: string) => {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (
    date.getFullYear() !== Number(yyyy) ||
    date.getMonth() !== Number(mm) - 1 ||
    date.getDate() !== Number(dd) ||
    date > new Date()
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
};

function Register() {
  const navigate = useNavigate();
  const product = getApoisProductMode();
  const productLabel = getProductLabel();
  const isCourier = product === "courier";
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    cpf: "",
    birthDate: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    fullName: false,
    phone: false,
    cpf: false,
    birthDate: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  const errors = useMemo<FormErrors>(() => {
    const next: FormErrors = {};
    if (formData.fullName.trim().split(/\s+/).length < 2)
      next.fullName = "Digite seu nome completo";
    if (onlyDigits(formData.phone).length < 10) next.phone = "Telefone incompleto";
    if (!isValidCpf(formData.cpf)) next.cpf = "Informe um CPF válido";
    if (!birthDateToIso(formData.birthDate)) {
      next.birthDate = "Informe a data no formato DD/MM/AAAA";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) next.email = "E-mail inválido";
    if (formData.password.length < 8) next.password = "A senha deve ter no mínimo 8 caracteres";
    if (formData.confirmPassword !== formData.password) {
      next.confirmPassword = "As senhas não coincidem";
    }
    return next;
  }, [formData]);

  const isFormValid = Object.keys(errors).length === 0 && formData.acceptTerms;
  const fieldError = (field: FieldName): string | undefined =>
    touched[field] || submitted ? errors[field] : undefined;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!isFormValid || isLoading) {
      setTouched({
        fullName: true,
        phone: true,
        cpf: true,
        birthDate: true,
        email: true,
        password: true,
        confirmPassword: true,
      });
      return;
    }

    const birthDateIso = birthDateToIso(formData.birthDate);
    if (!birthDateIso) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: formData.fullName.trim(),
            phone: formData.phone,
            cpf: onlyDigits(formData.cpf),
            birth_date: birthDateIso,
            terms_accepted_at: new Date().toISOString(),
            privacy_accepted_at: new Date().toISOString(),
            legal_version: "2026-08-09",
            signup_product: product,
          },
        },
      });

      if (error) {
        toast.error(
          error.message.includes("User already registered")
            ? "Este e-mail já está cadastrado."
            : `Erro ao criar conta: ${error.message}`,
        );
        return;
      }

      if (data.session) {
        toast.success(
          isCourier
            ? "Conta criada. Complete agora seu cadastro de entregador."
            : "Conta criada com sucesso!",
        );
        await navigate({ to: getProductHomeRoute() });
      } else if (data.user) {
        toast.success("Conta criada. Faça login para continuar.");
        await navigate({ to: "/login" });
      }
    } catch {
      toast.error("Ocorreu um erro inesperado ao realizar seu cadastro.");
    } finally {
      setIsLoading(false);
    }
  };

  const fieldClass = (hasError: boolean) =>
    `bg-zinc-900/50 border-zinc-800 h-11 rounded-xl text-white text-sm placeholder:text-zinc-600 focus:ring-primary focus:border-primary ${hasError ? "border-red-500/50" : ""}`;

  return (
    <div className="flex min-h-dvh w-full flex-col bg-black text-white">
      <header className="flex shrink-0 items-center bg-black px-4 py-2 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="-ml-2 rounded-full p-2 hover:bg-white/10"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src={product === "merchant" ? APOIS_OFFICIAL_RED_LOGO_URL : logoAsset.url}
            alt={product === "merchant" ? "Logomarca oficial APOIS" : "APOIS ENTREGA"}
            className="mb-3 h-14 w-auto object-contain"
          />
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
            {productLabel}
          </p>
          <h1 className="mt-2 text-[22px] font-black">
            {isCourier ? "Comece como entregador" : "Crie sua conta"}
          </h1>
          <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">
            {isCourier
              ? "Crie seu acesso. Na próxima etapa você informa veículo, endereço e envia os documentos para aprovação."
              : "Cadastre seus dados para começar a usar a APOIS ENTREGA."}
          </p>
        </div>

        <form onSubmit={handleSubmit} method="post" className="space-y-3" noValidate>
          <Field label="Nome completo" error={fieldError("fullName")}>
            <Input
              value={formData.fullName}
              onChange={(event) => setFormData({ ...formData, fullName: event.target.value })}
              onBlur={() => setTouched({ ...touched, fullName: true })}
              placeholder="Digite seu nome completo"
              autoComplete="name"
              className={fieldClass(Boolean(fieldError("fullName")))}
            />
          </Field>

          <Field label="Telefone celular" error={fieldError("phone")}>
            <Input
              type="tel"
              inputMode="tel"
              value={formData.phone}
              onChange={(event) =>
                setFormData({ ...formData, phone: maskPhone(event.target.value) })
              }
              onBlur={() => setTouched({ ...touched, phone: true })}
              placeholder="(00) 00000-0000"
              autoComplete="tel"
              className={fieldClass(Boolean(fieldError("phone")))}
            />
          </Field>

          <Field label="CPF" error={fieldError("cpf")}>
            <Input
              inputMode="numeric"
              value={formData.cpf}
              onChange={(event) => setFormData({ ...formData, cpf: maskCpf(event.target.value) })}
              onBlur={() => setTouched({ ...touched, cpf: true })}
              placeholder="000.000.000-00"
              maxLength={14}
              className={fieldClass(Boolean(fieldError("cpf")))}
            />
          </Field>

          <Field label="Data de nascimento" error={fieldError("birthDate")}>
            <Input
              inputMode="numeric"
              value={formData.birthDate}
              onChange={(event) =>
                setFormData({ ...formData, birthDate: maskBirthDate(event.target.value) })
              }
              onBlur={() => setTouched({ ...touched, birthDate: true })}
              placeholder="DD/MM/AAAA"
              maxLength={10}
              autoComplete="bday"
              className={fieldClass(Boolean(fieldError("birthDate")))}
            />
          </Field>

          <Field label="E-mail" error={fieldError("email")}>
            <Input
              type="email"
              value={formData.email}
              onChange={(event) => setFormData({ ...formData, email: event.target.value })}
              onBlur={() => setTouched({ ...touched, email: true })}
              placeholder="seu@email.com"
              autoComplete="email"
              className={fieldClass(Boolean(fieldError("email")))}
            />
          </Field>

          <Field label="Senha" error={fieldError("password")}>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                onBlur={() => setTouched({ ...touched, password: true })}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                className={`${fieldClass(Boolean(fieldError("password")))} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </Field>

          <Field label="Confirme a senha" error={fieldError("confirmPassword")}>
            <Input
              type={showPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={(event) =>
                setFormData({ ...formData, confirmPassword: event.target.value })
              }
              onBlur={() => setTouched({ ...touched, confirmPassword: true })}
              placeholder="Repita sua senha"
              autoComplete="new-password"
              className={fieldClass(Boolean(fieldError("confirmPassword")))}
            />
          </Field>

          <div className="flex items-start gap-3 pt-1">
            <Checkbox
              id="terms"
              checked={formData.acceptTerms}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, acceptTerms: checked === true })
              }
              className="mt-0.5 border-zinc-700 data-[state=checked]:bg-primary data-[state=checked]:text-black"
            />
            <label htmlFor="terms" className="text-[11px] leading-snug text-zinc-400">
              Aceito os{" "}
              <Link to="/termos" target="_blank" className="font-bold text-primary">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link to="/privacidade" target="_blank" className="font-bold text-primary">
                Política de Privacidade
              </Link>
              .
            </label>
          </div>

          {submitted && !formData.acceptTerms ? (
            <p className="text-[10px] text-red-500">Aceite os termos para continuar.</p>
          ) : null}

          <Button
            type="submit"
            disabled={isLoading || !isFormValid}
            className="h-12 w-full rounded-xl bg-primary text-base font-bold text-black disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {isLoading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : isCourier ? (
              "Continuar cadastro"
            ) : (
              "Criar minha conta"
            )}
          </Button>

          <p className="pt-1 text-center text-xs text-zinc-500">
            Já possui uma conta?{" "}
            <Link to="/login" className="font-bold text-primary">
              Entrar
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="ml-1 text-[11px] font-medium text-zinc-400">{label}</label>
      {children}
      {error ? <p className="ml-1 text-[10px] text-red-500">{error}</p> : null}
    </div>
  );
}
