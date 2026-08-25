import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Loader2,
  Mail,
  Phone,
  Save,
  User,
  UserX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePromptDialog } from "@/components/ui/prompt-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/perfil/dados-pessoais")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { session };
  },
  component: DadosPessoaisPage,
  head: () => ({ meta: [{ title: "Dados pessoais | APOIS ENTREGA" }] }),
});

type ProfileDraft = {
  full_name: string;
  phone: string;
  cpf: string;
  email: string;
  birth_date: string;
  avatar_url: string;
};

const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 5 * 1024 * 1024;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const onlyDigits = (value: string) => value.replace(/\D/g, "");

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function maskBirthDate(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isoToBirthDate(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function birthDateToIso(value: string) {
  if (!value.trim()) return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (
    date.getFullYear() !== Number(yyyy) ||
    date.getMonth() !== Number(mm) - 1 ||
    date.getDate() !== Number(dd) ||
    date > new Date()
  ) {
    return undefined;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function DadosPessoaisPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const { prompt, promptDialog } = usePromptDialog();
  const [profile, setProfile] = useState<ProfileDraft>({
    full_name: "",
    phone: "",
    cpf: "",
    email: "",
    birth_date: "",
    avatar_url: "",
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw userError ?? new Error("Usuário não encontrado");
        const { data, error } = await supabase
          .from("profiles")
          .select("full_name,phone,cpf,birth_date,avatar_url")
          .eq("id", user.id)
          .single();
        if (error) throw error;
        if (!cancelled) {
          setProfile({
            full_name: data?.full_name || "",
            phone: data?.phone || "",
            cpf: formatCpf(data?.cpf || ""),
            email: user.email || "",
            birth_date: isoToBirthDate(data?.birth_date),
            avatar_url: data?.avatar_url || "",
          });
        }
      } catch (error) {
        console.error("Erro ao carregar dados pessoais:", error);
        if (!cancelled) toast.error("Não foi possível carregar seus dados pessoais.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (profile.full_name.trim().length < 2) {
      return void toast.error("Informe seu nome completo.");
    }

    const normalizedCpf = onlyDigits(profile.cpf);
    if (!isValidCpf(normalizedCpf)) return void toast.error("Informe um CPF válido.");

    const birthDateIso = birthDateToIso(profile.birth_date);
    if (birthDateIso === undefined) {
      return void toast.error("Informe a data de nascimento no formato DD/MM/AAAA.");
    }

    const requestedEmail = profile.email.trim().toLowerCase();
    if (!emailPattern.test(requestedEmail)) return void toast.error("Informe um e-mail válido.");

    setSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Usuário não encontrado");

      const { data: saved, error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name.trim(),
          phone: profile.phone.trim() || null,
          cpf: normalizedCpf,
          birth_date: birthDateIso,
        })
        .eq("id", user.id)
        .select("full_name,phone,cpf,birth_date,avatar_url")
        .single();
      if (error) throw error;
      if (onlyDigits(saved?.cpf || "") !== normalizedCpf) {
        throw new Error("O CPF não foi persistido no perfil.");
      }

      setProfile((current) => ({
        ...current,
        full_name: saved.full_name || current.full_name,
        phone: saved.phone || "",
        cpf: formatCpf(saved.cpf || normalizedCpf),
        birth_date: isoToBirthDate(saved.birth_date),
        avatar_url: saved.avatar_url || current.avatar_url,
      }));

      const currentEmail = (user.email || "").trim().toLowerCase();
      if (requestedEmail !== currentEmail) {
        const { error: emailError } = await supabase.auth.updateUser(
          { email: requestedEmail },
          { emailRedirectTo: `${window.location.origin}/perfil/dados-pessoais` },
        );
        if (emailError) {
          toast.warning("Os outros dados foram salvos, mas não foi possível alterar o e-mail.");
          return;
        }
        toast.success("Dados salvos. Confirme a troca de e-mail pelas mensagens enviadas.");
        return;
      }
      toast.success("Perfil atualizado com sucesso.");
    } catch (error: any) {
      console.error("Erro ao salvar dados pessoais:", error);
      toast.error(error?.message || "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (uploadingAvatar) return;
    if (!allowedAvatarTypes.has(file.type)) {
      return void toast.error("Use uma imagem JPG, PNG ou WEBP.");
    }
    if (file.size > maxAvatarBytes) return void toast.error("A foto precisa ter no máximo 5 MB.");
    setUploadingAvatar(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Usuário não encontrado");
      const path = `${user.id}/avatar`;
      const upload = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
      if (upload.error) throw upload.error;
      const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = publicData.publicUrl;
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);
      if (error) throw error;
      setProfile((current) => ({ ...current, avatar_url: avatarUrl }));
      setAvatarVersion(Date.now());
      toast.success("Foto de perfil atualizada.");
    } catch {
      toast.error("Não foi possível atualizar sua foto de perfil.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deactivateAccount = async () => {
    if (deactivating) return;
    const values = await prompt({
      title: "Desativar conta",
      description:
        "Esta ação desativa sua conta e encerra sua sessão. Digite DESATIVAR para confirmar.",
      fields: [
        {
          key: "confirmation",
          label: "Confirmação",
          placeholder: "DESATIVAR",
          required: true,
        },
      ],
      confirmLabel: "Desativar conta",
      destructive: true,
    });
    if (values?.["confirmation"] !== "DESATIVAR") return;
    setDeactivating(true);
    try {
      const { error } = await (supabase.rpc as any)("deactivate_own_account");
      if (error) throw error;
      await supabase.auth.signOut();
      navigate({ to: "/login" });
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível desativar sua conta.");
      setDeactivating(false);
    }
  };

  const avatarSrc = profile.avatar_url
    ? `${profile.avatar_url}${profile.avatar_url.includes("?") ? "&" : "?"}v=${avatarVersion}`
    : "";

  return (
    <>
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/perfil" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Dados Pessoais</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 overflow-y-auto p-6 pb-[calc(env(safe-area-inset-bottom)+7rem)]">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-8">
            <section className="flex flex-col items-center">
              <div className="relative">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-primary bg-zinc-900">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt="Foto de perfil"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-12 w-12 text-primary" />
                  )}
                </div>
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 grid h-10 w-10 place-items-center rounded-full border-4 border-black bg-primary text-black"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAvatar(file);
                  }}
                />
              </div>
            </section>

            <form onSubmit={handleSave} method="post" className="space-y-6">
              <div className="space-y-4">
                <Field label="Nome completo" icon={User}>
                  <input
                    type="text"
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    className="profile-input"
                    required
                  />
                </Field>
                <Field label="Telefone" icon={Phone}>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="profile-input"
                  />
                </Field>
                <Field label="CPF" icon={User}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={profile.cpf}
                    onChange={(e) => setProfile({ ...profile, cpf: formatCpf(e.target.value) })}
                    className="profile-input"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    required
                  />
                </Field>
                <Field label="Data de nascimento" icon={CalendarDays}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={profile.birth_date}
                    onChange={(e) =>
                      setProfile({ ...profile, birth_date: maskBirthDate(e.target.value) })
                    }
                    className="profile-input"
                    placeholder="DD/MM/AAAA"
                    maxLength={10}
                  />
                </Field>
                <Field label="E-mail" icon={Mail}>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="profile-input"
                    required
                  />
                </Field>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-black disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </form>

            <section className="rounded-3xl border border-red-500/20 bg-red-500/5 p-5">
              <div className="flex items-start gap-3">
                <UserX className="h-5 w-5 text-red-400" />
                <div>
                  <h2 className="font-black text-red-300">Desativar minha conta</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Seu acesso será bloqueado e a sessão será encerrada.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deactivating}
                onClick={() => void deactivateAccount()}
                className="mt-4 h-11 w-full rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-black text-red-300"
              >
                {deactivating ? "Desativando..." : "Desativar conta"}
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
    {promptDialog}
    </>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="ml-1 text-xs font-bold uppercase tracking-widest text-primary">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
        <div className="[&_.profile-input]:w-full [&_.profile-input]:rounded-2xl [&_.profile-input]:border [&_.profile-input]:border-zinc-800 [&_.profile-input]:bg-zinc-900 [&_.profile-input]:py-4 [&_.profile-input]:pl-12 [&_.profile-input]:pr-4 [&_.profile-input]:text-white [&_.profile-input]:outline-none [&_.profile-input]:focus:border-primary">
          {children}
        </div>
      </div>
    </div>
  );
}
