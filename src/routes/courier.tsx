import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw, UserRound, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearPayoutAttemptKey, getPayoutAttemptKey } from "@/lib/payout-attempt";
import {
  ensureCourierPushRegistration,
  installCourierPushListeners,
  isNativeCourierAndroid,
  removeCourierPushRegistration,
} from "@/lib/courier-push";
import {
  CourierBottomNav,
  CourierHistoryPanel,
  CourierProfilePanel,
} from "@/components/CourierPanels";
import { CourierLocationTracker, type CourierPosition } from "@/components/CourierLocationTracker";
import { CourierLiveMap, CourierRouteMap } from "@/components/CourierRouteMap";
import {
  ActiveDelivery,
  CourierApplication,
  CourierFinance,
  CourierOfflineCard,
  CourierOfferCard,
  CourierReviewState,
  CourierStatusCard,
  CourierWaitingSheet,
} from "@/components/CourierPremiumViews";
import { CourierCompletionSheet, CourierSupportSheet } from "@/components/CourierCompletionSupport";
import logoAsset from "@/assets/logo.png.asset.json";

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

function CourierApp() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [courier, setCourier] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [nearbyMerchants, setNearbyMerchants] = useState<any[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<any[]>([]);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [completedJob, setCompletedJob] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payoutAccount, setPayoutAccount] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportDescription, setSupportDescription] = useState("");
  const [financeOpen, setFinanceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [payoutDraft, setPayoutDraft] = useState({
    pixKey: "",
    holderName: "",
    document: "",
    amount: "",
  });
  const [currentPosition, setCurrentPosition] = useState<CourierPosition | null>(null);
  const [payoutAvailable, setPayoutAvailable] = useState(false);
  const [payoutBlockedMessage, setPayoutBlockedMessage] = useState(
    "Saques estão temporariamente indisponíveis enquanto o recebimento direto dos entregadores é finalizado.",
  );
  const [manualPayoutMode, setManualPayoutMode] = useState(false);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [settlementBusy, setSettlementBusy] = useState<string | null>(null);

  const loadCourierOperations = useCallback(async (courierId: string) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
    const [availabilityRes, offersRes, jobsRes, walletRes, metricsRes, merchantsRes] =
      await Promise.all([
        from("courier_availability").select("*").eq("courier_id", courierId).maybeSingle(),
        rpc("get_courier_incoming_offers"),
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
        rpc("get_courier_metrics", { _timezone: timezone }),
        from("merchants")
          .select("id,name,latitude,longitude,is_open")
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .limit(100),
      ]);
    setAvailability(availabilityRes.data ?? null);
    setOffers(Array.isArray(offersRes.data) ? offersRes.data : []);
    setNearbyMerchants(merchantsRes.data ?? []);
    setActiveJob(jobsRes.data ?? null);
    setWallet(walletRes.data ?? null);
    if (metricsRes.error) {
      console.warn("courier metrics load failed", metricsRes.error.message);
      setMetrics(null);
    } else {
      setMetrics(metricsRes.data ?? null);
    }

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
    } else {
      setTransactions([]);
      setPayoutAccount(null);
      setPayouts([]);
    }

    const settlementsRes = await from("courier_settlements_view")
      .select("*")
      .eq("courier_id", courierId)
      .order("created_at", { ascending: false })
      .limit(100);
    const settlementRows = settlementsRes.data ?? [];
    const settlementMerchantIds = Array.from(
      new Set(settlementRows.map((row: any) => row.merchant_id).filter(Boolean)),
    );
    const settlementMerchantsRes = settlementMerchantIds.length
      ? await from("merchants").select("id,name").in("id", settlementMerchantIds)
      : { data: [] };
    const merchantNameById = new Map(
      (settlementMerchantsRes.data ?? []).map((row: any) => [row.id, row.name]),
    );
    setSettlements(
      settlementRows.map((row: any) => ({
        ...row,
        merchant_name: merchantNameById.get(row.merchant_id) ?? "Estabelecimento",
      })),
    );
  }, []);

  const loadAll = useCallback(
    async (quiet = false) => {
      quiet ? setRefreshing(true) : setLoading(true);
      setAppError(null);
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
        if (courierRow.status === "approved" && courierRow.is_active) {
          await loadCourierOperations(courierRow.id);
        }
      } catch (error: any) {
        const message = error?.message || "Não foi possível carregar o app do entregador.";
        setAppError(message);
        toast.error(message);
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
    let cancelled = false;
    (async () => {
      const { data, error } = await rpc("get_delivery_checkout_readiness");
      if (cancelled) return;
      if (error || !data) return;
      const live = data.mode === "marketplace_direct_live";
      setPayoutAvailable(live);
      setManualPayoutMode(data.mode === "merchant_manual");
      if (!live && data.message) {
        setPayoutBlockedMessage(
          "Saques estão temporariamente indisponíveis enquanto o recebimento direto dos entregadores é finalizado.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!courier?.id || courier.status !== "approved" || !courier.is_active) return;
    void installCourierPushListeners().then(async () => {
      const result = await ensureCourierPushRegistration(true);
      if (result.status === "permission-denied") {
        toast.error("Ative as notificações para receber chamadas de novas entregas.");
      } else if (result.status === "failed") {
        console.warn("courier push registration failed", result.message);
      }
    });
  }, [courier?.id, courier?.is_active, courier?.status]);

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

  const logout = async () => {
    if (activeJob) {
      toast.error("Conclua a entrega ativa antes de sair da conta.");
      return;
    }
    if (availability?.is_online) {
      const { error } = await rpc("set_courier_online", { _is_online: false });
      if (error) {
        toast.error(error.message || "Não foi possível ficar offline antes de sair.");
        return;
      }
    }
    await removeCourierPushRegistration();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
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

  const resubmitApplication = async () => {
    if (!courier?.id || courier.status !== "rejected") return;
    const requiredTypes =
      courier.vehicle_type === "bicicleta"
        ? ["foto_perfil"]
        : ["cnh", "documento_veiculo", "foto_perfil"];
    const pendingCorrection = requiredTypes.some((documentType) => {
      const document = documents.find((row) => row.document_type === documentType);
      return !document || !["pending", "approved"].includes(document.status);
    });
    if (pendingCorrection) {
      toast.error("Substitua todos os documentos recusados antes de reenviar o cadastro.");
      return;
    }

    const address = courier.address ?? {};
    setBusy("application");
    const { error } = await rpc("submit_courier_application", {
      _payload: {
        cpf: courier.cpf ?? "",
        birth_date: courier.birth_date ?? "",
        address: {
          street: address.street ?? "",
          number: address.number ?? "",
          neighborhood: address.neighborhood ?? "",
          city: address.city ?? "",
          state: address.state ?? "",
        },
        vehicle_type: courier.vehicle_type ?? "moto",
        vehicle_model: courier.vehicle_model ?? "",
        vehicle_plate: courier.vehicle_plate ?? "",
        cnh_number: courier.cnh_number ?? "",
      },
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "Não foi possível reenviar o cadastro.");
      return;
    }
    toast.success("Cadastro reenviado para análise.");
    await loadAll(true);
  };

  const uploadDocument = async (documentType: string, file: File) => {
    if (!courier?.id || !user?.id) return;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!allowedTypes.has(file.type)) {
      toast.error("Envie uma imagem JPG, PNG, WEBP ou um arquivo PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O documento deve ter no máximo 15 MB.");
      return;
    }
    setBusy(`doc:${documentType}`);
    let uploadedPath: string | null = null;
    let metadataCommitted = false;
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${user.id}/${documentType}-${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from("courier-documents")
        .upload(path, file, { upsert: false });
      if (upload.error) throw upload.error;
      uploadedPath = path;

      const existing = documents.find((doc) => doc.document_type === documentType);
      const previousStoragePath = existing?.storage_path ?? null;
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
      metadataCommitted = true;

      if (previousStoragePath && previousStoragePath !== path) {
        const { error: cleanupError } = await supabase.storage
          .from("courier-documents")
          .remove([previousStoragePath]);
        if (cleanupError) {
          console.warn("courier old document cleanup pending", cleanupError.message);
        }
      }

      toast.success(
        "Documento enviado com sucesso. Seu cadastro ficará em análise até a aprovação.",
      );
      await loadAll(true);
    } catch (error: any) {
      if (uploadedPath && !metadataCommitted) {
        await supabase.storage
          .from("courier-documents")
          .remove([uploadedPath])
          .catch(() => undefined);
      }
      toast.error(error?.message || "Falha ao enviar documento.");
    } finally {
      setBusy(null);
    }
  };

  const toggleOnline = async () => {
    if (!courier?.id || busy === "online") return;
    const target = !availability?.is_online;
    setBusy("online");

    try {
      if (target) {
        if (isNativeCourierAndroid()) {
          const pushState = await ensureCourierPushRegistration(true);
          if (pushState.status !== "registered") {
            const message =
              pushState.status === "permission-denied"
                ? "Ative as notificações para ficar online e receber chamadas de entrega."
                : pushState.status === "permission-required"
                  ? "Autorize as notificações para receber chamadas de entrega."
                  : pushState.status === "failed"
                    ? `Não foi possível ativar as chamadas de entrega: ${pushState.message}`
                    : "As chamadas nativas de entrega não estão disponíveis neste dispositivo.";
            throw new Error(message);
          }
        }

        if (!navigator.geolocation) {
          throw new Error(
            "Este dispositivo não disponibiliza localização. Ative o GPS para ficar online.",
          );
        }

        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            resolve,
            (geoError) => {
              const geoMessage =
                geoError.code === geoError.PERMISSION_DENIED
                  ? "Permita o acesso à localização para ficar online."
                  : geoError.code === geoError.POSITION_UNAVAILABLE
                    ? "Não foi possível obter sua localização agora. Verifique o GPS e tente novamente."
                    : "A localização demorou demais para responder. Verifique o GPS e tente novamente.";
              reject(new Error(geoMessage));
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            },
          ),
        );

        const initialPosition: CourierPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          heading:
            position.coords.heading !== null && Number.isFinite(position.coords.heading)
              ? position.coords.heading
              : null,
          speed:
            position.coords.speed !== null && Number.isFinite(position.coords.speed)
              ? position.coords.speed
              : null,
          recordedAt: Date.now(),
        };

        const { error: locationError } = await rpc("update_courier_location", {
          _latitude: initialPosition.lat,
          _longitude: initialPosition.lng,
          _accuracy_meters: initialPosition.accuracy,
          _heading: initialPosition.heading,
          _speed_mps: initialPosition.speed,
        });
        if (locationError) throw locationError;

        const { error: onlineError } = await rpc("set_courier_online", {
          _is_online: true,
        });
        if (onlineError) throw onlineError;
        setCurrentPosition(initialPosition);
      } else {
        const { error } = await rpc("set_courier_online", { _is_online: false });
        if (error) throw error;
        setCurrentPosition(null);
      }

      await loadCourierOperations(courier.id);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível atualizar sua disponibilidade.");
    } finally {
      setBusy(null);
    }
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
    const deliveredJob = activeJob;
    setBusy("delivery");
    const { data, error } = await rpc("complete_delivery_with_pin", {
      _delivery_job_id: activeJob.id,
      _pin: pin,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível concluir a entrega.");
    if (!data) return toast.error("PIN incorreto. Confira com o cliente.");
    setPin("");
    setSupportOpen(false);
    setSupportDescription("");
    setCompletedJob(deliveredJob);
    toast.success("Entrega concluída!");
    await loadCourierOperations(courier.id);
  };

  const reportDeliveryProblem = async () => {
    if (!activeJob) return;
    const description = supportDescription.trim();
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
    setSupportOpen(false);
    setSupportDescription("");
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
    if (!payoutAvailable) return toast.error(payoutBlockedMessage);
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

  const confirmSettlementReceived = async (settlementId: string) => {
    setSettlementBusy(settlementId);
    const { error } = await rpc("courier_confirm_courier_settlement", {
      _settlement_id: settlementId,
    });
    setSettlementBusy(null);
    if (error) return toast.error(error.message || "Não foi possível confirmar o recebimento.");
    toast.success("Recebimento confirmado.");
    if (courier?.id) await loadCourierOperations(courier.id);
  };

  const disputeSettlement = async (settlementId: string) => {
    setSettlementBusy(settlementId);
    const { error } = await rpc("courier_dispute_courier_settlement", {
      _settlement_id: settlementId,
      _reason: "Entregador informou que não recebeu o Pix.",
    });
    setSettlementBusy(null);
    if (error) return toast.error(error.message || "Não foi possível registrar a contestação.");
    toast.success("Contestação registrada. A APOIS foi notificada.");
    if (courier?.id) await loadCourierOperations(courier.id);
  };

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-black p-5 text-white">
        <div className="text-center">
          <img
            src={logoAsset.url}
            alt="APOIS ENTREGA"
            className="mx-auto h-14 w-auto object-contain"
          />
          <Loader2 className="mx-auto mt-6 h-7 w-7 animate-spin text-primary" />
          <p className="mt-3 text-xs font-bold text-zinc-500">Carregando sua jornada...</p>
        </div>
      </div>
    );
  }

  if (appError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-black p-5 text-white">
        <section className="w-full max-w-sm rounded-[2rem] border border-red-500/20 bg-zinc-950 p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-red-500/20 bg-red-500/10">
            <XCircle className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="mt-4 text-xl font-black">Não foi possível carregar o app</h1>
          <p className="mt-2 text-sm leading-5 text-zinc-500">
            {appError === "Sessão expirada."
              ? "Sua sessão expirou. Entre novamente para continuar."
              : "Verifique sua conexão com a internet e tente novamente."}
          </p>
          {appError === "Sessão expirada." ? (
            <Button
              onClick={() => navigate({ to: "/login" })}
              className="mt-5 h-12 w-full rounded-2xl font-black"
            >
              ENTRAR NOVAMENTE
            </Button>
          ) : (
            <Button
              onClick={() => void loadAll()}
              className="mt-5 h-12 w-full rounded-2xl font-black"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> TENTAR NOVAMENTE
            </Button>
          )}
        </section>
      </div>
    );
  }

  if (!courier) {
    return (
      <CourierApplication
        user={user}
        busy={busy === "application"}
        onSubmit={submitApplication}
        onBack={() => void logout()}
      />
    );
  }

  if (courier.status !== "approved" || !courier.is_active) {
    return (
      <CourierReviewState
        courier={courier}
        documents={documents}
        busy={busy}
        onUpload={uploadDocument}
        onRefresh={() => void loadAll(true)}
        refreshing={refreshing}
        onLogout={logout}
        onResubmit={resubmitApplication}
      />
    );
  }

  if (historyOpen) {
    return (
      <>
        <CourierHistoryPanel jobs={deliveryHistory} onClose={() => setHistoryOpen(false)} />
        <CourierBottomNav
          active="history"
          onHome={() => setHistoryOpen(false)}
          onHistory={() => undefined}
          onFinance={() => {
            setHistoryOpen(false);
            setFinanceOpen(true);
          }}
          onProfile={() => {
            setHistoryOpen(false);
            setProfileOpen(true);
          }}
        />
      </>
    );
  }

  if (profileOpen) {
    return (
      <>
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
        <CourierBottomNav
          active="profile"
          onHome={() => setProfileOpen(false)}
          onHistory={() => {
            setProfileOpen(false);
            setHistoryOpen(true);
          }}
          onFinance={() => {
            setProfileOpen(false);
            setFinanceOpen(true);
          }}
          onProfile={() => undefined}
        />
      </>
    );
  }

  if (financeOpen) {
    return (
      <>
        <CourierFinance
          wallet={wallet}
          metrics={metrics}
          transactions={transactions}
          payoutAccount={payoutAccount}
          payouts={payouts}
          draft={payoutDraft}
          setDraft={setPayoutDraft}
          busy={busy}
          payoutAvailable={payoutAvailable}
          payoutBlockedMessage={payoutBlockedMessage}
          manualPayoutMode={manualPayoutMode}
          settlements={settlements}
          settlementBusy={settlementBusy}
          onSaveAccount={savePayoutAccount}
          onRequestPayout={requestPayout}
          onConfirmSettlement={confirmSettlementReceived}
          onDisputeSettlement={disputeSettlement}
          onClose={() => setFinanceOpen(false)}
        />
        <CourierBottomNav
          active="finance"
          onHome={() => setFinanceOpen(false)}
          onHistory={() => {
            setFinanceOpen(false);
            setHistoryOpen(true);
          }}
          onFinance={() => undefined}
          onProfile={() => {
            setFinanceOpen(false);
            setProfileOpen(true);
          }}
        />
      </>
    );
  }

  const online = Boolean(availability?.is_online);

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-40 grid min-h-20 grid-cols-[3rem_1fr_3rem] items-center border-b border-primary/10 bg-black/92 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-2xl">
        <div aria-hidden="true" />
        <div className="flex justify-center py-2">
          <img
            src={logoAsset.url}
            alt="APOIS ENTREGA"
            className="h-11 w-auto max-w-[55vw] object-contain"
          />
        </div>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="Abrir perfil"
          className="relative grid h-11 w-11 place-items-center justify-self-end rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300 shadow-[0_8px_24px_rgba(0,0,0,0.4)] active:scale-95"
        >
          <UserRound className="h-5 w-5" />
          <span
            className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-black ${online ? "bg-emerald-400" : "bg-zinc-600"}`}
          />
        </button>
      </header>

      <CourierLocationTracker enabled={online} onPosition={setCurrentPosition} />

      <main className="mx-auto w-full max-w-lg space-y-4 overflow-x-hidden p-4 pb-[calc(7.7rem+env(safe-area-inset-bottom))]">
        <CourierStatusCard
          online={online}
          busy={busy === "online"}
          activeJob={activeJob}
          onToggle={toggleOnline}
        />

        {completedJob ? (
          <>
            <CourierLiveMap
              currentPosition={currentPosition}
              merchants={nearbyMerchants}
              activeOfferMerchantIds={[]}
            />
            <CourierCompletionSheet job={completedJob} onDone={() => setCompletedJob(null)} />
          </>
        ) : activeJob ? (
          <>
            <CourierRouteMap job={activeJob} currentPosition={currentPosition} />
            <ActiveDelivery
              job={activeJob}
              busy={busy === "delivery" || busy === "support"}
              supportBusy={busy === "support"}
              pin={pin}
              setPin={setPin}
              onTransition={transitionDelivery}
              onComplete={completeDelivery}
              onReport={() => setSupportOpen(true)}
            />
          </>
        ) : online ? (
          <>
            <CourierLiveMap
              currentPosition={currentPosition}
              merchants={nearbyMerchants}
              activeOfferMerchantIds={offers.map((offer) => offer.merchant_id).filter(Boolean)}
            />
            {offers.length > 0 ? (
              <div className="relative -mt-8 space-y-3">
                {offers.map((offer) => (
                  <CourierOfferCard
                    key={offer.id}
                    offer={offer}
                    busy={busy === `offer:${offer.id}`}
                    onAccept={acceptOffer}
                    onReject={rejectOffer}
                  />
                ))}
              </div>
            ) : (
              <CourierWaitingSheet
                metrics={metrics}
                wallet={wallet}
                onRefresh={() => courier?.id && void loadCourierOperations(courier.id)}
              />
            )}
          </>
        ) : (
          <CourierOfflineCard busy={busy === "online"} onToggle={toggleOnline} />
        )}
      </main>

      <CourierSupportSheet
        open={supportOpen && Boolean(activeJob)}
        value={supportDescription}
        onChange={setSupportDescription}
        busy={busy === "support"}
        onClose={() => {
          if (busy !== "support") {
            setSupportOpen(false);
            setSupportDescription("");
          }
        }}
        onSubmit={() => void reportDeliveryProblem()}
      />

      <CourierBottomNav
        active="home"
        onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onHistory={() => setHistoryOpen(true)}
        onFinance={() => setFinanceOpen(true)}
        onProfile={() => setProfileOpen(true)}
      />
    </div>
  );
}
