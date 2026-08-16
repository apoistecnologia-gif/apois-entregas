import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Loader2, Store, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

const from = (table: string) => (supabase.from as any)(table);
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});
const onlyDigits = (value: string) => value.replace(/\D/g, "");

type Profile = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  cpf?: string | null;
};

type Category = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (merchantId: string) => void | Promise<void>;
};

export function AdminMerchantCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ownerMode, setOwnerMode] = useState<"existing" | "new">("new");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [existingOwnerId, setExistingOwnerId] = useState("");
  const [form, setForm] = useState({
    ownerName: "",
    ownerPhone: "",
    ownerCpf: "",
    ownerEmail: "",
    ownerPassword: "",
    merchantName: "",
    legalName: "",
    document: "",
    categoryId: "",
    contactPhone: "",
    contactEmail: "",
    addressLine: "",
    neighborhood: "",
    city: "",
    state: "",
    approve: true,
  });

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [profilesRes, categoriesRes] = await Promise.all([
        from("profiles").select("id,full_name,phone,cpf").order("full_name"),
        from("merchant_categories").select("id,name").eq("is_active", true).order("name"),
      ]);
      if (profilesRes.error) toast.error(profilesRes.error.message);
      if (categoriesRes.error) toast.error(categoriesRes.error.message);
      setProfiles(profilesRes.data ?? []);
      setCategories(categoriesRes.data ?? []);
    })();
  }, [open]);

  const matches = useMemo(() => {
    const needle = ownerSearch.trim().toLocaleLowerCase("pt-BR");
    const digits = onlyDigits(ownerSearch);
    if (!needle) return profiles.slice(0, 8);
    return profiles
      .filter((profile) => {
        const name = String(profile.full_name ?? "").toLocaleLowerCase("pt-BR");
        const phone = onlyDigits(String(profile.phone ?? ""));
        return (
          profile.id.toLocaleLowerCase().includes(needle) ||
          name.includes(needle) ||
          (digits.length >= 4 && phone.includes(digits))
        );
      })
      .slice(0, 8);
  }, [ownerSearch, profiles]);

  const update = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setOwnerMode("new");
    setOwnerSearch("");
    setExistingOwnerId("");
    setForm({
      ownerName: "",
      ownerPhone: "",
      ownerCpf: "",
      ownerEmail: "",
      ownerPassword: "",
      merchantName: "",
      legalName: "",
      document: "",
      categoryId: "",
      contactPhone: "",
      contactEmail: "",
      addressLine: "",
      neighborhood: "",
      city: "",
      state: "",
      approve: true,
    });
  };

  const close = (next: boolean) => {
    if (!next && !busy) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    if (busy) return;
    if (!form.merchantName.trim()) return toast.error("Informe o nome do estabelecimento.");
    if (!form.categoryId) return toast.error("Selecione a categoria.");
    if (!form.addressLine.trim() || !form.city.trim() || form.state.trim().length !== 2) {
      return toast.error("Informe endereço, cidade e UF.");
    }

    setBusy(true);
    try {
      let ownerId = existingOwnerId;
      if (ownerMode === "new") {
        if (form.ownerName.trim().split(/\s+/).length < 2)
          throw new Error("Informe o nome completo do responsável.");
        if (onlyDigits(form.ownerPhone).length < 10)
          throw new Error("Informe um telefone válido do responsável.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim()))
          throw new Error("Informe um e-mail válido do responsável.");
        if (form.ownerPassword.length < 8)
          throw new Error("A senha provisória deve ter pelo menos 8 caracteres.");

        const authClient = createClient(
          import.meta.env["VITE_SUPABASE_URL"],
          import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          },
        );
        const { data, error } = await authClient.auth.signUp({
          email: form.ownerEmail.trim().toLowerCase(),
          password: form.ownerPassword,
          options: {
            data: {
              full_name: form.ownerName.trim(),
              phone: form.ownerPhone.trim(),
              cpf: onlyDigits(form.ownerCpf),
              signup_product: "merchant",
              admin_assisted_signup: true,
            },
          },
        });
        if (error) throw error;
        if (!data.user?.id) throw new Error("Não foi possível criar a conta do responsável.");
        ownerId = data.user.id;
      } else if (!ownerId) {
        throw new Error("Selecione o responsável existente.");
      }

      const { data, error } = await rpc("admin_create_merchant", {
        _owner_user_id: ownerId,
        _category_id: form.categoryId,
        _name: form.merchantName.trim(),
        _legal_name: form.legalName.trim(),
        _document: form.document.trim(),
        _contact_phone: (form.contactPhone || form.ownerPhone).trim(),
        _contact_email: (form.contactEmail || form.ownerEmail).trim(),
        _address_line: form.addressLine.trim(),
        _neighborhood: form.neighborhood.trim(),
        _city: form.city.trim(),
        _state: form.state.trim().toUpperCase(),
        _latitude: null,
        _longitude: null,
        _approve: form.approve,
      });
      if (error) throw error;
      const merchantId = String(data ?? "");
      if (!merchantId) throw new Error("O estabelecimento foi criado sem retornar o ID.");
      toast.success(
        form.approve
          ? "Responsável e estabelecimento cadastrados e liberados."
          : "Cadastro criado e enviado para análise.",
      );
      reset();
      onOpenChange(false);
      await onCreated(merchantId);
    } catch (error: any) {
      const message = String(error?.message ?? error ?? "Erro ao cadastrar estabelecimento.");
      toast.error(
        message.includes("User already registered")
          ? "Este e-mail já possui conta. Use a opção ‘Responsável já cadastrado’."
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-zinc-800 bg-zinc-950 text-white">
        <DialogHeader>
          <DialogTitle>Cadastrar estabelecimento</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Cadastre o responsável e o estabelecimento no mesmo fluxo, ou vincule uma conta que já
            existe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3 rounded-2xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 font-black">
              <UserPlus className="h-4 w-4 text-primary" /> Responsável
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={ownerMode === "new" ? "default" : "outline"}
                onClick={() => setOwnerMode("new")}
              >
                Criar conta do responsável
              </Button>
              <Button
                type="button"
                variant={ownerMode === "existing" ? "default" : "outline"}
                onClick={() => setOwnerMode("existing")}
              >
                Responsável já cadastrado
              </Button>
            </div>

            {ownerMode === "new" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  value={form.ownerName}
                  onChange={(e) => update("ownerName", e.target.value)}
                  placeholder="Nome completo do responsável"
                />
                <Input
                  value={form.ownerPhone}
                  onChange={(e) => update("ownerPhone", e.target.value)}
                  placeholder="Telefone do responsável"
                />
                <Input
                  value={form.ownerCpf}
                  onChange={(e) => update("ownerCpf", e.target.value)}
                  placeholder="CPF do responsável"
                />
                <Input
                  value={form.ownerEmail}
                  onChange={(e) => update("ownerEmail", e.target.value)}
                  placeholder="E-mail do responsável"
                  type="email"
                />
                <Input
                  className="md:col-span-2"
                  value={form.ownerPassword}
                  onChange={(e) => update("ownerPassword", e.target.value)}
                  placeholder="Senha provisória (mínimo 8 caracteres)"
                  type="password"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  placeholder="Busque por nome, telefone ou ID do responsável"
                />
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {matches.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setExistingOwnerId(profile.id)}
                      className={`w-full rounded-xl border p-3 text-left ${existingOwnerId === profile.id ? "border-primary bg-primary/10" : "border-zinc-800 bg-black"}`}
                    >
                      <div className="font-bold">{profile.full_name || "Usuário sem nome"}</div>
                      <div className="text-xs text-zinc-500">
                        {profile.phone || "Sem telefone"} · {profile.id}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center gap-2 font-black">
              <Store className="h-4 w-4 text-primary" /> Estabelecimento
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={form.merchantName}
                onChange={(e) => update("merchantName", e.target.value)}
                placeholder="Nome do estabelecimento"
              />
              <select
                value={form.categoryId}
                onChange={(e) => update("categoryId", e.target.value)}
                className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-white"
              >
                <option value="">Categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <Input
                value={form.legalName}
                onChange={(e) => update("legalName", e.target.value)}
                placeholder="Razão social"
              />
              <Input
                value={form.document}
                onChange={(e) => update("document", e.target.value)}
                placeholder="CNPJ/CPF"
              />
              <Input
                value={form.contactPhone}
                onChange={(e) => update("contactPhone", e.target.value)}
                placeholder="Telefone do estabelecimento"
              />
              <Input
                value={form.contactEmail}
                onChange={(e) => update("contactEmail", e.target.value)}
                placeholder="E-mail do estabelecimento"
              />
              <Input
                className="md:col-span-2"
                value={form.addressLine}
                onChange={(e) => update("addressLine", e.target.value)}
                placeholder="Rua, número e complemento"
              />
              <Input
                value={form.neighborhood}
                onChange={(e) => update("neighborhood", e.target.value)}
                placeholder="Bairro"
              />
              <Input
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                placeholder="Cidade"
              />
              <Input
                value={form.state}
                onChange={(e) => update("state", e.target.value.toUpperCase().slice(0, 2))}
                placeholder="UF"
                maxLength={2}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-800 bg-black p-3 text-sm">
              <input
                type="checkbox"
                checked={form.approve}
                onChange={(e) => update("approve", e.target.checked)}
              />
              <span>
                <strong>Liberar imediatamente</strong>
                <span className="block text-xs text-zinc-500">
                  Já deixa o estabelecimento aprovado e ativo.
                </span>
              </span>
            </label>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="font-black"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Store className="mr-2 h-4 w-4" />
            )}
            Cadastrar e salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
