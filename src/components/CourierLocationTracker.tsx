import { Loader2, LocateFixed, MapPinOff } from "lucide-react";
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

export function CourierLocationTracker({
  enabled,
  onPosition,
}: {
  enabled: boolean;
  onPosition?: (position: CourierPosition | null) => void;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "active" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
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

    if (!navigator.geolocation) {
      setStatus("error");
      setErrorMessage("Este dispositivo não disponibiliza localização.");
      onPosition?.(null);
      return;
    }

    let disposed = false;
    setStatus("locating");

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

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        if (disposed) return;
        const next: CourierPosition = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          accuracy: Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : null,
          heading:
            result.coords.heading !== null && Number.isFinite(result.coords.heading)
              ? result.coords.heading
              : null,
          speed:
            result.coords.speed !== null && Number.isFinite(result.coords.speed)
              ? result.coords.speed
              : null,
          recordedAt: Date.now(),
        };
        latestPositionRef.current = next;
        onPosition?.(next);
        void sendLocation(next);
      },
      (error) => {
        if (disposed) return;
        console.warn("Localização do entregador indisponível:", error.code);
        setStatus("error");
        setErrorMessage(
          error.code === error.PERMISSION_DENIED
            ? "Ative a permissão de localização para receber corridas próximas."
            : "Não foi possível obter sua localização. Verifique o GPS.",
        );
        latestPositionRef.current = null;
        onPosition?.(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      },
    );

    // Keep the server-side courier heartbeat fresh even when the device is stationary.
    // Dispatch intentionally ignores stale availability/location records.
    const heartbeatId = window.setInterval(() => {
      const latest = latestPositionRef.current;
      if (!latest || disposed) return;
      void sendLocation({ ...latest, recordedAt: Date.now() });
    }, 60_000);

    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(heartbeatId);
      latestPositionRef.current = null;
      sendingRef.current = false;
    };
  }, [enabled, onPosition]);

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
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : status === "error" ? (
        <MapPinOff className="h-4 w-4" />
      ) : (
        <LocateFixed className="h-4 w-4" />
      )}
      <span>
        {status === "locating"
          ? "Obtendo localização para receber corridas..."
          : status === "error"
            ? errorMessage
            : "Localização ativa para receber corridas próximas"}
      </span>
    </div>
  );
}
