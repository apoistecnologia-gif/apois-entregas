import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type MerchantAsaasOnboardingProps = {
  merchant: any;
};

type HolderType = "individual" | "mei" | "company";

type FinancialDraft = {
  holderType: HolderType;
  legalName: string;
  cpfCnpj: string;
  birthDate: string;
  email: string;
  mobilePhone: string;
  incomeValue: string;
  address: string;
  addressNumber: string;
  complement: string;
  province: string;
  postalCode: string;
};

const emptyDraft: FinancialDraft = {
  holderType: "individual",
  legalName: "",
  cpfCnpj: "",
  birthDate: "",
  email: "",
  mobilePhone: "",
  incomeValue: "",
  address: "",
  addressNumber: "",
  complement: "",
  province: "",
  postalCode: "",
};

export function MerchantAsaasOnboarding({ merchant }: MerchantAsaasOnboardingProps) {
  const [draft, setDraft] = useState<FinancialDraft>(emptyDraft);
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "create" | null>(null);

  const load = useCallback(async () => {
    if (!merchant?.id) return;
    setLoading(true);
    const [{ data: profile }, { data: asaasAccount }] = await Promise.all([
      (supabase.from as any)("merchant_financial_profiles")
        .select("*")
        .eq("merchant_id", merchant.id)
        .maybeSingle(),
      (supabase.from as any)("merchant_asaas_accounts")
        .select("asaas_account_id,asaas_wallet_id,status,last_error")
        .eq("merchant_id", merchant.id)
        .maybeSingle(),
    ]);

    if (profile) {
      setDraft({
        holderType: profile.holder_type,
        legalName: profile.legal_name ?? "",
        cpfCnpj: profile.cpf_cnpj ?? "",
        birthDate: profile.birth_date ?? "",
        email: profile.email ?? "",
        mobilePhone: profile.mobile_phone ?? "",
        incomeValue: profile.income_value != null ? String(profile.income_value) : "",
        address: profile.address ?? "",
        addressNumber: profile.address_number ?? "",
        complement: profile.complement ?? "",
        province: profile.province ?? "",
        postalCode: profile.postal_code ?? "",
      });
    } else {
      setDraft((current) => ({
        ...current,
        legalName: merchant.legal_name || merchant.name || "",
        cpfCnpj: merchant.document || "",
        email: merchant.contact_email || "",
        mobilePhone: merchant.contact_phone || "",
        address: merchant.address_line || "",
        province: merchant.neighborhood || "",
      }));
    }
    setAccount(asaasAccount ?? null);
    setLoading(false);
  }, [merchant]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (key: keyof FinancialDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!merchant?.id) return false;
    const income = Number(draft.incomeValue.replace(",", "."));
    if (
      !draft.legalName.trim() ||
      !draft.cpfCnpj.trim() ||
      !draft.email.trim() ||
      !draft.mobilePhone.trim() ||
      !draft.address.trim() ||
      !draft.addressNumber.trim() ||
      !draft.province.trim() ||
      !draft.postalCode.trim() ||
      !Number.isFinite(income) ||
      income <= 0 ||
      (draft.holderType === "individual" && !draft.birthDate)
    ) {
      toast.error("Complete os dados financeiros obrigatórios.");
      return false;
    }

    setBusy("save");
    const { error } = await (supabase.from as any)("merchant_financial_profiles").upsert(
      {
        merchant_id: merchant.id,
        holder_type: draft.holderType,
        legal_name: draft.legalName.trim(),
        cpf_cnpj: draft.cpfCnpj.replace(/\D/g, ""),
        birth_date: draft.holderType === "individual" ? draft.birthDate : null,
        company_type:
          draft.holderType === "mei" ? "MEI" : draft.holderType === "company" ? "LIMITED" : null,
        email: draft.email.trim(),
        mobile_phone: draft.mobilePhone.replace(/\D/g, ""),
        income_value: income,
        address: draft.address.trim(),
        address_number: draft.addressNumber.trim(),
        complement: draft.complement.trim() || null,
        province: draft.province.trim(),
        postal_code: draft.postalCode.replace(/\D/g, ""),
      },
      { onConflict: "merchant_id" },
    );
    setBusy(null);
    if (error) {
      toast.error(error.message || "Não foi possível salvar os dados financeiros.");
      return false;
    }
    toast.success("Dados financeiros salvos.");
    return true;
  };

  const createAccount = async () => {
    const saved = await save();
    if (!saved) return;
    setBusy("create");
    const { data, error } = await supabase.functions.invoke("asaas-merchant-account", {
      body: { merchantId: merchant.id },
    });
    setBusy(null);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Não foi possível abrir a conta financeira.");
      await load();
      return;
    }
    toast.success(
      data?.reused ? "Conta Asaas já estava ativa." : "Conta Asaas criada com sucesso.",
    );
    await load();
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </section>
    );
  }

  if (account?.status === "active") {
    return (
      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
          <div>
            <h2 className="font-black text-emerald-300">Conta financeira Asaas ativa</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Os pagamentos PIX podem ser divididos automaticamente e os saques podem ser enviados
              por PIX pela subconta deste estabelecimento.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-primary/20 bg-zinc-950 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="font-black">Conta financeira Asaas</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Cadastre o titular como pessoa física, MEI ou empresa. Após a abertura, o repasse dos
            pedidos e os saques PIX ficam vinculados à subconta do estabelecimento.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => update("holderType", "individual")}
          className={`rounded-xl border p-3 text-sm font-bold ${draft.holderType === "individual" ? "border-primary bg-primary/10 text-primary" : "border-zinc-800 text-zinc-400"}`}
        >
          Pessoa física
        </button>
        <button
          type="button"
          onClick={() => update("holderType", "mei")}
          className={`rounded-xl border p-3 text-sm font-bold ${draft.holderType === "mei" ? "border-primary bg-primary/10 text-primary" : "border-zinc-800 text-zinc-400"}`}
        >
          MEI
        </button>
        <button
          type="button"
          onClick={() => update("holderType", "company")}
          className={`rounded-xl border p-3 text-sm font-bold ${draft.holderType === "company" ? "border-primary bg-primary/10 text-primary" : "border-zinc-800 text-zinc-400"}`}
        >
          Empresa
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={draft.legalName}
          onChange={(e) => update("legalName", e.target.value)}
          placeholder="Nome/Razão social"
        />
        <Input
          value={draft.cpfCnpj}
          onChange={(e) => update("cpfCnpj", e.target.value)}
          placeholder={draft.holderType === "individual" ? "CPF" : "CNPJ"}
        />
        {draft.holderType === "individual" ? (
          <Input
            type="date"
            value={draft.birthDate}
            onChange={(e) => update("birthDate", e.target.value)}
          />
        ) : null}
        <Input
          type="email"
          value={draft.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="E-mail"
        />
        <Input
          value={draft.mobilePhone}
          onChange={(e) => update("mobilePhone", e.target.value)}
          placeholder="Celular"
        />
        <Input
          type="number"
          value={draft.incomeValue}
          onChange={(e) => update("incomeValue", e.target.value)}
          placeholder="Renda/Faturamento mensal"
        />
        <Input
          value={draft.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="Endereço"
        />
        <Input
          value={draft.addressNumber}
          onChange={(e) => update("addressNumber", e.target.value)}
          placeholder="Número"
        />
        <Input
          value={draft.complement}
          onChange={(e) => update("complement", e.target.value)}
          placeholder="Complemento"
        />
        <Input
          value={draft.province}
          onChange={(e) => update("province", e.target.value)}
          placeholder="Bairro"
        />
        <Input
          value={draft.postalCode}
          onChange={(e) => update("postalCode", e.target.value)}
          placeholder="CEP"
        />
      </div>

      {account?.status === "error" && account.last_error ? (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
          O último cadastro financeiro não foi concluído. Revise os dados e tente novamente.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void save()}
          disabled={busy !== null}
          className="border-zinc-800 bg-black"
        >
          {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar dados
        </Button>
        <Button type="button" onClick={() => void createAccount()} disabled={busy !== null}>
          {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Criar conta Asaas
        </Button>
      </div>
    </section>
  );
}
