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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/perfil/dados-pessoais")({
  ssr: false,
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
  component: DadosPessoaisPage,
  head: () => ({ meta: [{ title: "Dados pessoais | APOIS ENTREGA" }] }),
});

type ProfileDraft = {
  full_name: string;
  phone: string;
  email: string;
  birth_date: string;
  avatar_url: string;
};

const allowedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 5 * 1024 * 1024;

function DadosPessoaisPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [profile, setProfile] = useState<ProfileDraft>({
    full_name: "",
    phone: "",
    email: "",
    birth_date: "",
    avatar_url: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw userError ?? new Error("Usuário não encontrado");

        const { data, error } = await supabase
          .from("profiles")
          .select("full_name,phone,birth_date,avatar_url")
          .eq("id", user.id)
          .single();

        if (error) throw error;
        if (!cancelled) {
          setProfile({
            full_name: data?.full_name || "",
            phone: data?.phone || "",
            email: user.email || "",
            birth_date: data?.birth_date || "",
            avatar_url: data?.avatar_url || "",
          });
        }
      } catch (error) {
        console.error("Erro ao carregar dados pessoais:", error);
        if (!cancelled) toast.error("Não foi possível carregar seus dados pessoais.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (profile.full_name.trim().length < 2) {
      toast.error("Informe seu nome completo.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Usuário não encontrado");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name.trim(),
          phone: profile.phone.trim() || null,
          birth_date: profile.birth_date || null,
        })
        .eq("id", user.id);

      if (error) throw error;
      toast.success("Perfil atualizado com sucesso.");
    } catch (error) {
      console.error("Erro ao salvar dados pessoais:", error);
      toast.error("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (uploadingAvatar) return;
    if (!allowedAvatarTypes.has(file.type)) {
      toast.error("Use uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > maxAvatarBytes) {
      toast.error("A foto precisa ter no máximo 5 MB.");
      return;
    }

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
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);
      if (profileError) throw profileError;

      setProfile((current) => ({ ...current, avatar_url: avatarUrl }));
      setAvatarVersion(Date.now());
      toast.success("Foto de perfil atualizada.");
    } catch (error) {
      console.error("Erro ao atualizar avatar:", error);
      toast.error("Não foi possível atualizar sua foto de perfil.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deactivateAccount = async () => {
    if (deactivating) return;
    const confirmation = window.prompt(
      "Esta ação desativa sua conta e encerra sua sessão. Digite DESATIVAR para confirmar.",
    );
    if (confirmation !== "DESATIVAR") {
      if (confirmation !== null) toast.error("Confirmação inválida. A conta não foi alterada.");
      return;
    }

    setDeactivating(true);
    try {
      const { error } = await (supabase.rpc as any)("deactivate_own_account");
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Sua conta foi desativada.");
      navigate({ to: "/login" });
    } catch (error: any) {
      console.error("Erro ao desativar conta:", error);
      toast.error(error?.message || "Não foi possível desativar sua conta.");
      setDeactivating(false);
    }
  };

  const avatarSrc = profile.avatar_url
    ? `${profile.avatar_url}${profile.avatar_url.includes("?") ? "&" : "?"}v=${avatarVersion}`
    : "";

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/perfil" })}
          className="rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Voltar para o perfil"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-300" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Dados Pessoais</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-8">
            <section className="flex flex-col items-center">
              <div className="relative">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-primary bg-zinc-900 shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Foto de perfil" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-12 w-12 text-primary" />
                  )}
                </div>
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 grid h-10 w-10 place-items-center rounded-full border-4 border-black bg-primary text-black disabled:opacity-60"
                  aria-label="Alterar foto de perfil"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
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
              <p className="mt-3 text-xs text-zinc-500">JPG, PNG ou WEBP · até 5 MB</p>
            </section>

            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-4">
                <Field label="Nome completo" icon={User}>
                  <input
                    type="text"
                    value={profile.full_name}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, full_name: event.target.value }))
                    }
                    className="profile-input"
                    placeholder="Seu nome completo"
                    autoComplete="name"
                    required
                  />
                </Field>

                <Field label="Telefone" icon={Phone}>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, phone: event.target.value }))
                    }
                    className="profile-input"
                    placeholder="(00) 00000-0000"
                    autoComplete="tel"
                  />
                </Field>

                <Field label="Data de nascimento" icon={CalendarDays}>
                  <input
                    type="date"
                    value={profile.birth_date}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, birth_date: event.target.value }))
                    }
                    className="profile-input"
                  />
                </Field>

                <div className="space-y-2 opacity-60">
                  <label className="ml-1 text-xs font-bold uppercase tracking-widest text-primary">
                    E-mail (apenas leitura)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="email"
                      value={profile.email}
                      readOnly
                      className="w-full cursor-not-allowed rounded-2xl border border-zinc-800/50 bg-zinc-900/50 py-4 pl-12 pr-4 text-zinc-500"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-black transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </form>

            <section className="rounded-3xl border border-red-500/20 bg-red-500/5 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-red-500/10 p-2.5 text-red-400">
                  <UserX className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-black text-red-300">Desativar minha conta</h2>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Seu acesso será bloqueado e a sessão será encerrada. Dados operacionais que
                    precisem ser preservados por segurança, suporte ou obrigações legais não são
                    apagados automaticamente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deactivating}
                onClick={() => void deactivateAccount()}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 text-sm font-black text-red-300 disabled:opacity-50"
              >
                {deactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {deactivating ? "Desativando..." : "Desativar conta"}
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
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
      <label className="ml-1 text-xs font-bold uppercase tracking-widest text-primary">{label}</label>
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
        <div className="[&_.profile-input]:w-full [&_.profile-input]:rounded-2xl [&_.profile-input]:border [&_.profile-input]:border-zinc-800 [&_.profile-input]:bg-zinc-900 [&_.profile-input]:py-4 [&_.profile-input]:pl-12 [&_.profile-input]:pr-4 [&_.profile-input]:text-white [&_.profile-input]:outline-none [&_.profile-input]:transition-colors [&_.profile-input]:focus:border-primary">
          {children}
        </div>
      </div>
    </div>
  );
}
