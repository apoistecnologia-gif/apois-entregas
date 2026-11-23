import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Loader2, LocateFixed, MapPinOff, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CourierPosition = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: number;
};

const distanceMeters = (a: CourierPosition, b: CourierPosition) => {
  const radius = 6371000;
  const latitude1 = (a.lat * Math.PI) / 180;
  const latitude2 = (b.lat * Math.PI) / 180;
  const deltaLatitude = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLongitude = ((b.lng - a.lng) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

const toCourierPosition = (result: {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    heading?: number | null;
    speed?: number | null;
  };
}): CourierPosition => ({
  lat: result.coords.latitude,
  lng: result.coords.longitude,
  accuracy: Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : null,
  heading:
    result.coords.heading !== null &&
    result.coords.heading !== undefined &&
    Number.isFinite(result.coords.heading)
      ? result.coords.heading
      : null,
  speed:
    result.coords.speed !== null &&
    result.coords.speed !== undefined &&
    Number.isFinite(result.coords.speed)
      ? result.coords.speed
      : null,
  recordedAt: Date.now(),
});

const isPermissionDenied = (error: unknown) => {
  const source = error as { code?: string | number; message?: string } | null;
  const text = `${String(source?.code ?? "")} ${String(source?.message ?? "")}`.toLowerCase();
  return (
    text.includes("0003") ||
    text.includes("permission") ||
    text.includes("permissão") ||
    text.includes("denied")
  );
};

export function CourierLocationTracker({
  enabled,
  onPosition,
}: {
  enabled: boolean;
  onPosition?: (position: CourierPosition | null) => void;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "active" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const lastSentRef = useRef<CourierPosition | null>(null);
  const latestPositionRef = useRef<CourierPosition | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setErrorMessage("");
      lastSentRef.current = null;
      latestPositionRef.current = null;
      onPosition?.(null);
      return;
    }

    let disposed = false;
    let nativeWatchId: string | null = null;
    let webWatchId: number | null = null;
    setStatus("locating");
    setErrorMessage("");

    const forceOffline = async () => {
      const { error } = await (supabase as any).rpc("set_courier_online", {
        _is_online: false,
      });
      if (error) console.warn("Não foi possível corrigir o estado online sem localização:", error);
    };

    const sendLocation = async (position: CourierPosition) => {
      if (sendingRef.current || disposed) return;
      const previous = lastSentRef.current;
      const elapsed = previous
        ? position.recordedAt - previous.recordedAt
        : Number.POSITIVE_INFINITY;
      const moved = previous ? distanceMeters(previous, position) : Number.POSITIVE_INFINITY;
      if (elapsed < 45_000 && moved < 30) return;

      sendingRef.current = true;
      const { error } = await (supabase as any).rpc("update_courier_location", {
        _latitude: position.lat,
        _longitude: position.lng,
        _accuracy_meters: position.accuracy,
        _heading: position.heading,
        _speed_mps: position.speed,
      });
      sendingRef.current = false;
      if (disposed) return;

      if (error) {
        console.error("Erro ao atualizar localização do entregador:", error);
        setStatus("error");
        setErrorMessage("Não foi possível atualizar sua localização no servidor.");
        return;
      }

      lastSentRef.current = position;
      setStatus("active");
      setErrorMessage("");
    };

    const receivePosition = (result: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy: number;
        heading?: number | null;
        speed?: number | null;
      };
    }) => {
      if (disposed) return;
      const next = toCourierPosition(result);
      latestPositionRef.current = next;
      onPosition?.(next);
      void sendLocation(next);
    };

    const receiveError = (error: unknown) => {
      if (disposed) return;
      const permissionDenied = isPermissionDenied(error);
      console.warn("Localização do entregador indisponível:", error);
      setStatus("error");
      setErrorMessage(
        permissionDenied
          ? "Permita a localização para ficar online e receber entregas próximas."
          : "Não foi possível obter sua localização. Verifique se o GPS está ligado.",
      );
      latestPositionRef.current = null;
      onPosition?.(null);
      if (permissionDenied) void forceOffline();
    };

    const startNativeTracking = async () => {
      let permission = await Geolocation.checkPermissions();
      if (permission.location !== "granted") {
        // Chamada direta ao plugin nativo: é ela que abre o diálogo de permissão do Android.
        permission = await Geolocation.requestPermissions({
          permissions: ["location", "coarseLocation"],
        });
      }

      if (permission.location !== "granted") {
        receiveError({ code: "OS-PLUG-GLOC-0003", message: "Permissão de localização negada." });
        return;
      }

      try {
        const initial = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20_000,
          maximumAge: 0,
        });
        receivePosition(initial);
      } catch (error) {
        if (isPermissionDenied(error)) {
          receiveError(error);
          return;
        }
        const fallback = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15_000,
          maximumAge: 60_000,
        });
        receivePosition(fallback);
      }

      if (disposed) return;
      nativeWatchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 20_000,
          maximumAge: 30_000,
          minimumUpdateInterval: 5_000,
        },
        (position, error) => {
          if (position) {
            receivePosition(position);
            return;
          }
          if (error && isPermissionDenied(error)) receiveError(error);
        },
      );
    };

    const startWebTracking = () => {
      if (!navigator.geolocation) {
        receiveError({ message: "Este dispositivo não disponibiliza localização." });
        return;
      }
      webWatchId = navigator.geolocation.watchPosition(receivePosition, receiveError, {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      });
    };

    if (isNativeAndroid()) {
      void startNativeTracking().catch(receiveError);
    } else {
      startWebTracking();
    }

    // Mantém o heartbeat do entregador fresco mesmo parado.
    const heartbeatId = window.setInterval(() => {
      const latest = latestPositionRef.current;
      if (!latest || disposed) return;
      void sendLocation({ ...latest, recordedAt: Date.now() });
    }, 60_000);

    return () => {
      disposed = true;
      if (nativeWatchId) void Geolocation.clearWatch({ id: nativeWatchId });
      if (webWatchId !== null) navigator.geolocation?.clearWatch(webWatchId);
      window.clearInterval(heartbeatId);
      latestPositionRef.current = null;
      sendingRef.current = false;
    };
  }, [enabled, onPosition, retryNonce]);

  if (!enabled) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ${
        status === "error"
          ? "border-red-500/20 bg-red-500/5 text-red-300"
          : "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
      }`}
      role={status === "error" ? "alert" : "status"}
    >
      {status === "locating" ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : status === "error" ? (
        <MapPinOff className="h-4 w-4 shrink-0" />
      ) : (
        <LocateFixed className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">
        {status === "locating"
          ? "Solicitando localização..."
          : status === "error"
            ? errorMessage
            : "Localização ativa para receber entregas próximas"}
      </span>
      {status === "error" ? (
        <button
          type="button"
          onClick={() => setRetryNonce((value) => value + 1)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-current/25 px-2 py-1 text-[10px] font-black"
        >
          <RefreshCw className="h-3 w-3" />
          Permitir
        </button>
      ) : null}
    </div>
  );
}
