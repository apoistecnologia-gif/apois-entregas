import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  Bike,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  PackageCheck,
  Power,
  RefreshCw,
  Route as RouteIcon,
  Upload,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearPayoutAttemptKey, getPayoutAttemptKey } from "@/lib/payout-attempt";
import {
  CourierBottomNav,
  CourierHistoryPanel,
  CourierProfilePanel,
} from "@/components/CourierPanels";

export const Route = createFileRoute("/courier")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { session };
  },
  component: CourierApp,
  head: () => ({ meta: [{ title: "APOIS Entregador" }] }),
});

const from = (table: string) => (supabase.from as any)(table);
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});
const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

function CourierApp() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [courier, setCourier] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<any[]>([]);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payoutAccount, setPayoutAccount] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [financeOpen, setFinanceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [payoutDraft, setPayoutDraft] = useState({
    pixKey: "",
    holderName: "",
    document: "",
    amount: "",
  });
  const locationWatchRef = useRef<number | null>(null);

  const loadCourierOperations = useCallback(async (courierId: string) => {
    const [availabilityRes, offersRes, jobsRes, walletRes] = await Promise.all([
      from("courier_availability").select("*").eq("courier_id", courierId).maybeSingle(),
      from("delivery_offers")
        .select("*, delivery_jobs(*, orders(order_number,total,status))")
        .eq("courier_id", courierId)
        .eq("status", "offered")
        .gt("expires_at", new Date().toISOString())
        .order("offered_at"),
      from("delivery_jobs")
        .select("*, orders(order_number,total,status,observation)")
        .eq("courier_id", courierId)
        .in("status", [
          "accepted",
          "arriving_pickup",
          "at_pickup",
          "picked_up",
          "on_the_way",
          "arrived_destination",
        ])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      from("wallets").select("*").eq("courier_id", courierId).maybeSingle(),
    ]);
    setAvailability(availabilityRes.data ?? null);
    setOffers(offersRes.data ?? []);
    setActiveJob(jobsRes.data ?? null);
    setWallet(walletRes.data ?? null);

    const historyRes = await from("delivery_jobs")
      .select("*, orders(order_number,total,status,observation)")
      .eq("courier_id", courierId)
      .in("status", ["delivered", "cancelled"])
      .order("updated_at", { ascending: false })
      .limit(100);
    setDeliveryHistory(historyRes.data ?? []);

    if (walletRes.data) {
      const [txRes, accountRes, payoutsRes] = await Promise.all([
        from("wallet_transactions")
          .select("*")
          .eq("wallet_id", walletRes.data.id)
          .order("created_at", { ascending: false })
          .limit(100),
        from("payout_accounts").select("*").eq("wallet_id", walletRes.data.id).maybeSingle(),
        from("payouts")
          .select("*")
          .eq("wallet_id", walletRes.data.id)
          .order("requested_at", { ascending: false })
          .limit(50),
      ]);
      setTransactions(txRes.data ?? []);
      setPayoutAccount(accountRes.data ?? null);
      setPayouts(payoutsRes.data ?? []);
      if (accountRes.data) {
        setPayoutDraft((current) => ({
          ...current,
          pixKey: accountRes.data.pix_key ?? "",
          holderName: accountRes.data.holder_name ?? "",
          document: accountRes.data.document ?? "",
        }));
      }
    }
  }, []);

  const loadAll = useCallback(
    async (quiet = false) => {
      quiet ? setRefreshing(true) : setLoading(true);
      try {
        const {
          data: { user: authUser },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !authUser) throw new Error("Sessão expirada.");
        setUser(authUser);
        const courierRes = await from("couriers")
          .select("*")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (courierRes.error) throw courierRes.error;
        const courierRow = courierRes.data ?? null;
        setCourier(courierRow);
        if (!courierRow) {
          setDocuments([]);
          return;
        }
        const docsRes = await from("courier_documents")
          .select("*")
          .eq("courier_id", courierRow.id)
          .order("created_at");
        setDocuments(docsRes.data ?? []);
        if (courierRow.status === "approved" && courierRow.is_active)
          await loadCourierOperations(courierRow.id);
      } catch (error: any) {
        toast.error(error?.message || "Não foi possível carregar o app do entregador.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadCourierOperations],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!courier?.id || courier.status !== "approved") return;
    const refresh = () => void loadCourierOperations(courier.id);
    const offersChannel = supabase
      .channel(`courier_offers_${courier.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_offers",
          filter: `courier_id=eq.${courier.id}`,
        },
        refresh,
      )
      .subscribe();
    const jobsChannel = supabase
      .channel(`courier_jobs_${courier.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_jobs",
          filter: `courier_id=eq.${courier.id}`,
        },
        refresh,
      )
      .subscribe();
    const interval = window.setInterval(refresh, 7000);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(offersChannel);
      void supabase.removeChannel(jobsChannel);
    };
  }, [courier?.id, courier?.status, loadCourierOperations]);

  const sendLocation = useCallback((position: GeolocationPosition) => {
    void rpc("update_courier_location", {
      _latitude: position.coords.latitude,
      _longitude: position.coords.longitude,
      _accuracy_meters: position.coords.accuracy,
      _heading: position.coords.heading,
      _speed_mps: position.coords.speed,
    }).then(({ error }: any) => {
      if (error && !String(error.message).includes("online"))
        console.warn("courier location update failed", error.message);
    });
  }, []);

  useEffect(() => {
    if (!availability?.is_online || !navigator.geolocation) {
      if (locationWatchRef.current !== null)
        navigator.geolocation?.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
      return;
    }
    locationWatchRef.current = navigator.geolocation.watchPosition(sendLocation, () => undefined, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    });
    return () => {
      if (locationWatchRef.current !== null)
        navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    };
  }, [availability?.is_online, sendLocation]);

  const logout = async () => {
    if (availability?.is_online) await rpc("set_courier_online", { _is_online: false });
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const submitApplication = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("application");
    const payload = {
      cpf: String(data.get("cpf") ?? ""),
      birth_date: String(data.get("birthDate") ?? ""),
      address: {
        street: String(data.get("street") ?? ""),
        number: String(data.get("number") ?? ""),
        neighborhood: String(data.get("neighborhood") ?? ""),
        city: String(data.get("city") ?? ""),
        state: String(data.get("state") ?? "").toUpperCase(),
      },
      vehicle_type: String(data.get("vehicleType") ?? "moto"),
      vehicle_model: String(data.get("vehicleModel") ?? ""),
      vehicle_plate: String(data.get("vehiclePlate") ?? ""),
      cnh_number: String(data.get("cnh") ?? ""),
    };
    const { error } = await rpc("submit_courier_application", { _payload: payload });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível enviar o cadastro.");
    toast.success("Cadastro enviado para análise.");
    await loadAll();
  };

  const uploadDocument = async (documentType: string, file: File) => {
    if (!courier?.id || !user?.id) return;
    setBusy(`doc:${documentType}`);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${user.id}/${documentType}-${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from("courier-documents")
        .upload(path, file, { upsert: false });
      if (upload.error) throw upload.error;
      const existing = documents.find((doc) => doc.document_type === documentType);
      const write = existing
        ? await from("courier_documents")
            .update({ storage_path: path, status: "pending" })
            .eq("id", existing.id)
        : await from("courier_documents").insert({
            courier_id: courier.id,
            document_type: documentType,
            storage_path: path,
            status: "pending",
          });
      if (write.error) throw write.error;
      toast.success("Documento enviado.");
      await loadAll(true);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao enviar documento.");
    } finally {
      setBusy(null);
    }
  };

  const toggleOnline = async () => {
    if (!courier?.id) return;
    const target = !availability?.is_online;
    if (target && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
          }),
        );
        setBusy("online");
        const { error } = await rpc("set_courier_online", { _is_online: true });
        if (error) throw error;
        sendLocation(position);
      } catch (error: any) {
        setBusy(null);
        return toast.error(error?.message || "Ative a localização para ficar online.");
      }
    } else {
      setBusy("online");
      const { error } = await rpc("set_courier_online", { _is_online: false });
      if (error) {
        setBusy(null);
        return toast.error(error.message);
      }
    }
    setBusy(null);
    await loadCourierOperations(courier.id);
  };

  const acceptOffer = async (offerId: string) => {
    if (!courier?.id) return;
    setBusy(`offer:${offerId}`);
    const { error } = await rpc("accept_delivery_offer", { _offer_id: offerId });
    setBusy(null);
    if (error) return toast.error(error.message || "Esta entrega não está mais disponível.");
    toast.success("Entrega aceita.");
    await loadCourierOperations(courier.id);
  };

  const rejectOffer = async (offerId: string) => {
    if (!courier?.id) return;
    setBusy(`offer:${offerId}`);
    const { error } = await rpc("reject_delivery_offer", { _offer_id: offerId });
    setBusy(null);
    if (error) return toast.error(error.message);
    await loadCourierOperations(courier.id);
  };

  const transitionDelivery = async (status: string) => {
    if (!activeJob || !courier?.id) return;
    setBusy("delivery");
    const { error } = await rpc("courier_transition_delivery", {
      _delivery_job_id: activeJob.id,
      _new_status: status,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível atualizar a entrega.");
    toast.success("Etapa atualizada.");
    await loadCourierOperations(courier.id);
  };

  const completeDelivery = async () => {
    if (!activeJob || !courier?.id || !/^\d{4}$/.test(pin))
      return toast.error("Informe o PIN de 4 dígitos do cliente.");
    setBusy("delivery");
    const { data, error } = await rpc("complete_delivery_with_pin", {
      _delivery_job_id: activeJob.id,
      _pin: pin,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível concluir a entrega.");
    if (!data) return toast.error("PIN incorreto. Confira com o cliente.");
    setPin("");
    toast.success("Entrega concluída!");
    await loadCourierOperations(courier.id);
  };

  const reportDeliveryProblem = async () => {
    if (!activeJob) return;
    const description = window.prompt("Descreva o problema desta entrega para o suporte:")?.trim();
    if (!description) return;
    if (description.length < 10) {
      toast.error("Descreva o problema com pelo menos 10 caracteres.");
      return;
    }

    setBusy("support");
    const { error } = await rpc("create_support_ticket", {
      _category: "delivery",
      _subject: `Problema na entrega #${activeJob.orders?.order_number ?? activeJob.order_id}`,
      _description: description,
      _order_id: activeJob.order_id,
      _delivery_job_id: activeJob.id,
    });
    setBusy(null);

    if (error) {
      toast.error(error.message || "Não foi possível abrir o chamado.");
      return;
    }
    toast.success("Chamado aberto para o suporte.");
  };

  const savePayoutAccount = async () => {
    if (!wallet || !payoutDraft.pixKey.trim()) return;
    setBusy("account");
    const row = {
      wallet_id: wallet.id,
      account_type: "pix",
      pix_key: payoutDraft.pixKey.trim(),
      holder_name: payoutDraft.holderName.trim() || null,
      document: payoutDraft.document.replace(/\D/g, "") || null,
      is_active: true,
    };
    const result = payoutAccount
      ? await from("payout_accounts").update(row).eq("id", payoutAccount.id)
      : await from("payout_accounts").insert(row);
    setBusy(null);
    if (result.error) return toast.error(result.error.message);
    toast.success("Chave PIX salva.");
    if (courier?.id) await loadCourierOperations(courier.id);
  };

  const requestPayout = async () => {
    if (!wallet || !payoutAccount) return toast.error("Cadastre sua chave PIX primeiro.");
    const amount = Number(payoutDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Informe um valor válido.");
    const attemptKey = getPayoutAttemptKey("courier", wallet.id, amount);
    setBusy("payout");
    const { error } = await rpc("request_payout", {
      _wallet_id: wallet.id,
      _amount: amount,
      _idempotency_key: attemptKey,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível solicitar o saque.");
    clearPayoutAttemptKey("courier", wallet.id, attemptKey);
    setPayoutDraft((current) => ({ ...current, amount: "" }));
    toast.success("Saque solicitado.");
    if (courier?.id) await loadCourierOperations(courier.id);
  };

  const expectedEarnings = useMemo(
    () =>
      offers.reduce((sum, offer) => sum + Number(offer.delivery_jobs?.estimated_earnings || 0), 0),
    [offers],
  );

  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (!courier)
    return (
      <CourierApplication
        user={user}
        busy={busy === "application"}
        onSubmit={submitApplication}
        onBack={() => navigate({ to: "/perfil" })}
      />
    );
  if (courier.status !== "approved" || !courier.is_active)
    return (
      <CourierReviewState
        courier={courier}
        documents={documents}
        busy={busy}
        onUpload={uploadDocument}
        onRefresh={() => void loadAll(true)}
        refreshing={refreshing}
        onLogout={logout}
        onResubmit={submitApplication}
      />
    );

  if (historyOpen) {
    return <CourierHistoryPanel jobs={deliveryHistory} onClose={() => setHistoryOpen(false)} />;
  }

  if (profileOpen) {
    return (
      <CourierProfilePanel
        courier={courier}
        user={user}
        documents={documents}
        availability={availability}
        wallet={wallet}
        onFinance={() => {
          setProfileOpen(false);
          setFinanceOpen(true);
        }}
        onLogout={() => void logout()}
        onClose={() => setProfileOpen(false)}
      />
    );
  }

  if (financeOpen) {
    return (
      <CourierFinance
        courier={courier}
        wallet={wallet}
        transactions={transactions}
        payoutAccount={payoutAccount}
        payouts={payouts}
        draft={payoutDraft}
        setDraft={setPayoutDraft}
        busy={busy}
        onSaveAccount={savePayoutAccount}
        onRequestPayout={requestPayout}
        onClose={() => setFinanceOpen(false)}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-900 bg-black/90 p-4 backdrop-blur">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
            APOIS ENTREGADOR
          </p>
          <p className="text-sm text-zinc-500">Olá, {user?.email?.split("@")[0]}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFinanceOpen(true)}
            className="rounded-full bg-zinc-900 p-2"
          >
            <WalletCards className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={logout}
            className="rounded-full bg-zinc-900 p-2 text-red-400"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-4 pb-28">
        <section
          className={`rounded-3xl border p-5 ${availability?.is_online ? "border-emerald-500/30 bg-emerald-500/10" : "border-zinc-800 bg-zinc-950"}`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-zinc-500">Status</p>
              <p
                className={`mt-1 text-xl font-black ${availability?.is_online ? "text-emerald-400" : "text-zinc-400"}`}
              >
                {availability?.is_online ? "ONLINE" : "OFFLINE"}
              </p>
            </div>
            <button
              type="button"
              disabled={busy === "online" || Boolean(activeJob && availability?.is_online)}
              onClick={toggleOnline}
              className={`grid h-14 w-14 place-items-center rounded-full ${availability?.is_online ? "bg-emerald-500 text-black" : "bg-primary text-black"}`}
            >
              {busy === "online" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Power className="h-6 w-6" />
              )}
            </button>
          </div>
          {activeJob && availability?.is_online ? (
            <p className="mt-3 text-xs text-zinc-500">
              Finalize a entrega atual antes de ficar offline.
            </p>
          ) : null}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="text-[10px] font-black uppercase text-zinc-500">Saldo disponível</p>
            <p className="mt-1 text-xl font-black text-primary">
              {money(wallet?.available_balance)}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="text-[10px] font-black uppercase text-zinc-500">Avaliação</p>
            <p className="mt-1 text-xl font-black">{Number(courier.rating || 0).toFixed(1)} ★</p>
          </div>
        </div>

        {activeJob ? (
          <ActiveDelivery
            job={activeJob}
            busy={busy === "delivery" || busy === "support"}
            supportBusy={busy === "support"}
            pin={pin}
            setPin={setPin}
            onTransition={transitionDelivery}
            onComplete={completeDelivery}
            onReport={reportDeliveryProblem}
          />
        ) : null}

        {!activeJob && availability?.is_online ? (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-black">Entregas disponíveis</h2>
                <p className="text-xs text-zinc-500">Ofertas válidas próximas de você</p>
              </div>
              <button
                type="button"
                onClick={() => courier?.id && void loadCourierOperations(courier.id)}
                className="rounded-full bg-zinc-900 p-2"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  busy={busy === `offer:${offer.id}`}
                  onAccept={acceptOffer}
                  onReject={rejectOffer}
                />
              ))}
              {offers.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/60 p-8 text-center">
                  <LocateFixed className="mx-auto h-8 w-8 text-zinc-700" />
                  <p className="mt-3 font-bold">Procurando entregas...</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Mantenha o app aberto e a localização ativa.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {!activeJob && !availability?.is_online ? (
          <div className="rounded-3xl border border-zinc-900 bg-zinc-950 p-8 text-center">
            <Bike className="mx-auto h-10 w-10 text-zinc-700" />
            <p className="mt-3 font-black">Fique online para receber entregas</p>
            <p className="mt-1 text-sm text-zinc-500">
              Ao ativar, sua localização será usada para encontrar pedidos próximos.
            </p>
          </div>
        ) : null}

        {offers.length > 0 ? (
          <p className="text-center text-[10px] text-zinc-600">
            Potencial das ofertas atuais: {money(expectedEarnings)}
          </p>
        ) : null}
      </main>
      <CourierBottomNav
        onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onHistory={() => setHistoryOpen(true)}
        onFinance={() => setFinanceOpen(true)}
        onProfile={() => setProfileOpen(true)}
      />
    </div>
  );
}

function CourierApplication({ user, busy, onSubmit, onBack }: any) {
  return (
    <div className="min-h-dvh bg-black p-4 text-white">
      <button type="button" onClick={onBack} className="mt-3 text-sm font-bold text-zinc-500">
        ← Voltar
      </button>
      <div className="mt-6">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">
          APOIS ENTREGADOR
        </p>
        <h1 className="mt-2 text-3xl font-black">Faça seu cadastro</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Preencha seus dados. Documentos serão enviados na etapa seguinte.
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-7 space-y-3">
        <Input name="cpf" placeholder="CPF" required inputMode="numeric" />
        <Input name="birthDate" type="date" placeholder="Data de nascimento" required />
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <Input name="street" placeholder="Rua" required />
          <Input name="number" placeholder="Número" required />
        </div>
        <Input name="neighborhood" placeholder="Bairro" required />
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <Input name="city" placeholder="Cidade" required />
          <Input name="state" placeholder="UF" maxLength={2} required />
        </div>
        <select
          name="vehicleType"
          required
          className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm"
        >
          <option value="moto">Moto</option>
          <option value="carro">Carro</option>
          <option value="bicicleta">Bicicleta</option>
        </select>
        <Input name="vehicleModel" placeholder="Modelo do veículo" required />
        <Input name="vehiclePlate" placeholder="Placa do veículo" />
        <Input name="cnh" placeholder="Número da CNH" inputMode="numeric" />
        <p className="text-xs text-zinc-600">Conta: {user?.email}</p>
        <Button disabled={busy} className="h-14 w-full rounded-2xl font-black uppercase">
          {busy ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <ChevronRight className="mr-2 h-5 w-5" />
          )}
          Enviar cadastro
        </Button>
      </form>
    </div>
  );
}

function CourierReviewState({
  courier,
  documents,
  busy,
  onUpload,
  onRefresh,
  refreshing,
  onLogout,
}: any) {
  const required = [
    { type: "cnh", label: "CNH" },
    { type: "documento_veiculo", label: "Documento do veículo" },
    { type: "foto_perfil", label: "Foto do entregador" },
  ];
  return (
    <div className="min-h-dvh bg-black p-4 text-white">
      <div className="flex items-center justify-between pt-3">
        <p className="font-black text-primary">APOIS ENTREGADOR</p>
        <button type="button" onClick={onLogout} className="text-sm font-bold text-red-400">
          Sair
        </button>
      </div>
      <div className="mt-8 rounded-3xl border border-zinc-900 bg-zinc-950 p-5">
        <FileCheck2 className="h-9 w-9 text-primary" />
        <p className="mt-4 text-xs font-black uppercase text-zinc-500">Situação</p>
        <h1 className="mt-1 text-2xl font-black uppercase text-primary">
          {courier.status.replaceAll("_", " ")}
        </h1>
        {courier.rejection_reason ? (
          <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {courier.rejection_reason}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className="mt-4 flex items-center gap-2 text-sm font-bold text-zinc-400"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Atualizar situação
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {required.map((item) => {
          const doc = documents.find((row: any) => row.document_type === item.type);
          return (
            <label
              key={item.type}
              className="block rounded-2xl border border-zinc-900 bg-zinc-950 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{item.label}</span>
                <span
                  className={`text-[10px] font-black uppercase ${doc?.status === "approved" ? "text-emerald-400" : doc?.status === "rejected" ? "text-red-400" : "text-primary"}`}
                >
                  {doc?.status ?? "Não enviado"}
                </span>
              </div>
              {doc?.rejection_reason ? (
                <p className="mt-2 text-xs text-red-300">{doc.rejection_reason}</p>
              ) : null}
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <Upload className="h-4 w-4" /> Selecionar arquivo
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-2 w-full text-xs text-zinc-600"
                disabled={busy === `doc:${item.type}`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUpload(item.type, file);
                }}
              />
            </label>
          );
        })}
      </div>
      <p className="mt-5 text-center text-xs text-zinc-600">
        Após a aprovação, o botão Online e as ofertas de entrega serão liberados automaticamente.
      </p>
    </div>
  );
}

function OfferCard({ offer, busy, onAccept, onReject }: any) {
  const job = offer.delivery_jobs;
  const pickup = job?.pickup_address ?? {};
  const delivery = job?.delivery_address ?? {};
  const distanceKm = Number(job?.estimated_distance_meters || 0) / 1000;
  const durationMinutes = Math.max(
    1,
    Math.round(Number(job?.estimated_duration_seconds || 0) / 60),
  );
  return (
    <div className="overflow-hidden rounded-3xl border border-primary/30 bg-zinc-950 shadow-[0_0_35px_rgba(255,193,7,0.08)]">
      <div className="flex items-center justify-between bg-primary/10 px-5 py-3">
        <span className="text-xs font-black uppercase text-primary">Nova entrega</span>
        <span className="text-xs font-bold text-zinc-400">
          até{" "}
          {new Date(offer.expires_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-zinc-900 p-2">
            <StoreIcon />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-zinc-500">Retirada</p>
            <p className="font-bold">{pickup.name || "Estabelecimento"}</p>
            <p className="text-xs text-zinc-500">
              {pickup.address_line || pickup.street || "Endereço do estabelecimento"}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-zinc-900 p-2">
            <MapPin className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-zinc-500">Entrega</p>
            <p className="font-bold">
              {delivery.street || "Destino"}, {delivery.number || "s/n"}
            </p>
            <p className="text-xs text-zinc-500">{delivery.neighborhood || ""}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-black p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <RouteIcon className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-black uppercase">Distância</span>
            </div>
            <p className="mt-1 text-sm font-black">
              {distanceKm > 0 ? `${distanceKm.toFixed(1).replace(".", ",")} km` : "A calcular"}
            </p>
          </div>
          <div className="rounded-2xl bg-black p-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Clock3 className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-black uppercase">Tempo</span>
            </div>
            <p className="mt-1 text-sm font-black">
              {Number(job?.estimated_duration_seconds || 0) > 0
                ? `${durationMinutes} min`
                : "A calcular"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-black p-4">
          <span className="text-sm text-zinc-500">Seu ganho estimado</span>
          <span className="text-2xl font-black text-primary">{money(job?.estimated_earnings)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void onReject(offer.id)}
            className="h-12 border-zinc-800"
          >
            Recusar
          </Button>
          <Button
            disabled={busy}
            onClick={() => void onAccept(offer.id)}
            className="h-12 font-black"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "ACEITAR"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActiveDelivery({
  job,
  busy,
  supportBusy,
  pin,
  setPin,
  onTransition,
  onComplete,
  onReport,
}: any) {
  const pickup = job.pickup_address ?? {};
  const delivery = job.delivery_address ?? {};
  const action =
    job.status === "accepted"
      ? { status: "arriving_pickup", label: "Ir para o estabelecimento", icon: Navigation }
      : job.status === "arriving_pickup"
        ? { status: "at_pickup", label: "Cheguei ao estabelecimento", icon: MapPin }
        : job.status === "at_pickup"
          ? { status: "picked_up", label: "Pedido retirado", icon: PackageCheck }
          : job.status === "picked_up"
            ? { status: "on_the_way", label: "Iniciar entrega", icon: RouteIcon }
            : job.status === "on_the_way"
              ? { status: "arrived_destination", label: "Cheguei ao destino", icon: MapPin }
              : null;
  return (
    <section className="rounded-3xl border border-primary/30 bg-zinc-950 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase text-primary">Entrega em andamento</p>
          <p className="mt-1 text-xl font-black">Pedido #{job.orders?.order_number}</p>
        </div>
        <Bike className="h-8 w-8 text-primary" />
      </div>
      <div className="mt-5 space-y-3">
        <AddressRow
          label="Retirada"
          title={pickup.name || "Estabelecimento"}
          detail={pickup.address_line || pickup.street}
        />
        <AddressRow
          label="Destino"
          title={`${delivery.street || "Destino"}, ${delivery.number || "s/n"}`}
          detail={delivery.neighborhood}
        />
      </div>
      <div className="mt-4 rounded-xl bg-black px-3 py-2 text-center text-[10px] font-black uppercase text-zinc-500">
        Etapa atual: {job.status.replaceAll("_", " ")}
      </div>
      {action ? (
        <Button
          disabled={busy}
          onClick={() => void onTransition(action.status)}
          className="mt-4 h-14 w-full rounded-2xl font-black uppercase"
        >
          {busy ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <action.icon className="mr-2 h-5 w-5" />
          )}
          {action.label}
        </Button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onReport()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 py-3 text-sm font-bold text-red-300 disabled:opacity-50"
      >
        {supportBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <XCircle className="h-4 w-4" />
        )}
        {supportBusy ? "Abrindo chamado..." : "Reportar problema"}
      </button>
      {job.status === "arrived_destination" ? (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-black p-4">
          <p className="text-sm font-bold">Confirme o PIN do cliente</p>
          <p className="mt-1 text-xs text-zinc-500">
            Peça o código de 4 dígitos antes de entregar o pedido.
          </p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="0000"
            className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-center text-2xl font-black tracking-[0.5em]"
          />
          <Button
            disabled={busy || pin.length !== 4}
            onClick={onComplete}
            className="mt-3 h-12 w-full"
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            Finalizar entrega
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function CourierFinance({
  courier,
  wallet,
  transactions,
  payoutAccount,
  payouts,
  draft,
  setDraft,
  busy,
  onSaveAccount,
  onRequestPayout,
  onClose,
}: any) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 flex items-center justify-between border-b border-zinc-900 bg-black/90 p-4">
        <button type="button" onClick={onClose} className="rounded-full bg-zinc-900 p-2">
          ←
        </button>
        <h1 className="font-black">Carteira</h1>
        <CircleDollarSign className="text-primary" />
      </header>
      <main className="space-y-4 p-4 pb-16">
        <div className="rounded-3xl bg-primary p-6 text-black">
          <p className="text-xs font-black uppercase">Disponível para saque</p>
          <p className="mt-2 text-4xl font-black">{money(wallet?.available_balance)}</p>
          <p className="mt-2 text-xs opacity-70">
            Saldo total {money(wallet?.balance)} · reservado {money(wallet?.reserved_balance)}
          </p>
        </div>
        {!wallet ? (
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-sm text-zinc-500">
            Sua carteira será criada automaticamente após a primeira entrega liquidada.
          </div>
        ) : (
          <>
            <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <h2 className="font-black">Recebimento via PIX</h2>
              <FinanceInput
                value={draft.pixKey}
                onChange={(v) => setDraft((d: any) => ({ ...d, pixKey: v }))}
                placeholder="Chave PIX"
              />
              <FinanceInput
                value={draft.holderName}
                onChange={(v) => setDraft((d: any) => ({ ...d, holderName: v }))}
                placeholder="Titular"
              />
              <FinanceInput
                value={draft.document}
                onChange={(v) => setDraft((d: any) => ({ ...d, document: v }))}
                placeholder="CPF/CNPJ"
              />
              <Button className="w-full" disabled={busy === "account"} onClick={onSaveAccount}>
                Salvar chave
              </Button>
            </section>
            <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <h2 className="font-black">Solicitar saque</h2>
              <FinanceInput
                value={draft.amount}
                onChange={(v) => setDraft((d: any) => ({ ...d, amount: v }))}
                placeholder="Valor"
                type="number"
              />
              <Button
                className="w-full"
                disabled={!payoutAccount || busy === "payout"}
                onClick={onRequestPayout}
              >
                Solicitar
              </Button>
            </section>
            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <h2 className="font-black">Saques</h2>
              <div className="mt-3 space-y-2">
                {payouts.map((p: any) => (
                  <div key={p.id} className="flex justify-between rounded-xl bg-black p-3 text-sm">
                    <div>
                      <b>{money(p.amount)}</b>
                      <p className="text-xs text-zinc-600">{dateTime(p.requested_at)}</p>
                    </div>
                    <span className="text-xs font-black uppercase text-primary">{p.status}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <h2 className="font-black">Extrato</h2>
              <div className="mt-3 divide-y divide-zinc-900">
                {transactions.map((tx: any) => (
                  <div key={tx.id} className="flex justify-between py-3 text-sm">
                    <div>
                      <b>{tx.description || tx.transaction_type}</b>
                      <p className="text-xs text-zinc-600">{dateTime(tx.created_at)}</p>
                    </div>
                    <span
                      className={
                        Number(tx.balance_delta) >= 0
                          ? "font-black text-emerald-400"
                          : "font-black text-red-400"
                      }
                    >
                      {Number(tx.balance_delta) >= 0 ? "+" : ""}
                      {money(tx.balance_delta)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function AddressRow({ label, title, detail }: { label: string; title: string; detail?: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-black p-3">
      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <p className="text-[10px] font-black uppercase text-zinc-600">{label}</p>
        <p className="text-sm font-bold">{title}</p>
        {detail ? <p className="text-xs text-zinc-500">{detail}</p> : null}
      </div>
    </div>
  );
}
function StoreIcon() {
  return <PackageCheck className="h-4 w-4 text-primary" />;
}
function FinanceInput({ value, onChange, placeholder, type = "text" }: any) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      step={type === "number" ? "0.01" : undefined}
      placeholder={placeholder}
      className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
    />
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm outline-none focus:border-primary"
    />
  );
}
