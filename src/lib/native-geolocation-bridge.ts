import { Capacitor, registerPlugin } from "@capacitor/core";

type NativePermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

type NativePosition = {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitudeAccuracy?: number | null;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
  };
};

type NativeGeolocationPlugin = {
  checkPermissions: () => Promise<{
    location: NativePermissionState;
    coarseLocation: NativePermissionState;
  }>;
  requestPermissions: (options?: { permissions?: Array<"location" | "coarseLocation"> }) => Promise<{
    location: NativePermissionState;
    coarseLocation: NativePermissionState;
  }>;
  getCurrentPosition: (options?: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
    enableLocationFallback?: boolean;
  }) => Promise<NativePosition>;
  watchPosition: (
    options: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
      minimumUpdateInterval?: number;
      interval?: number;
      enableLocationFallback?: boolean;
    },
    callback: (position: NativePosition | null, error?: { code?: string; message?: string }) => void,
  ) => Promise<string>;
  clearWatch: (options: { id: string }) => Promise<void>;
};

const NativeGeolocation = registerPlugin<NativeGeolocationPlugin>("Geolocation");

const toWebPosition = (position: NativePosition): GeolocationPosition =>
  ({
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude ?? null,
      altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
      heading: position.coords.heading ?? null,
      speed: position.coords.speed ?? null,
      toJSON: () => ({}),
    },
    timestamp: position.timestamp || Date.now(),
    toJSON: () => ({}),
  }) as GeolocationPosition;

const toWebError = (error: unknown): GeolocationPositionError => {
  const source = error as { code?: string | number; message?: string } | null;
  const codeText = String(source?.code ?? "");
  const permissionDenied = codeText.includes("0003");
  const timeout = codeText.includes("0010");
  const code = permissionDenied ? 1 : timeout ? 3 : 2;
  return {
    code,
    message:
      source?.message ||
      (permissionDenied
        ? "Permissão de localização negada."
        : timeout
          ? "Tempo esgotado ao obter localização."
          : "Não foi possível obter a localização."),
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
};

export const installNativeGeolocationBridge = () => {
  if (
    typeof navigator === "undefined" ||
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== "android"
  ) {
    return;
  }

  let nextWatchId = 1;
  const watches = new Map<number, { nativeId: string | undefined; cancelled: boolean }>();

  const adapter: Geolocation = {
    getCurrentPosition(success, failure, options) {
      void (async () => {
        try {
          let permission = await NativeGeolocation.checkPermissions();
          if (permission.location !== "granted") {
            permission = await NativeGeolocation.requestPermissions({ permissions: ["location"] });
          }
          if (permission.location !== "granted") {
            throw { code: "OS-PLUG-GLOC-0003", message: "Permissão de localização negada." };
          }
          const position = await NativeGeolocation.getCurrentPosition({
            enableHighAccuracy: options?.enableHighAccuracy ?? true,
            timeout: options?.timeout ?? 20000,
            maximumAge: options?.maximumAge ?? 0,
            enableLocationFallback: true,
          });
          success(toWebPosition(position));
        } catch (error) {
          failure?.(toWebError(error));
        }
      })();
    },

    watchPosition(success, failure, options) {
      const webId = nextWatchId++;
      const state = { cancelled: false as boolean, nativeId: undefined as string | undefined };
      watches.set(webId, state);
      void (async () => {
        try {
          let permission = await NativeGeolocation.checkPermissions();
          if (permission.location !== "granted") {
            permission = await NativeGeolocation.requestPermissions({ permissions: ["location"] });
          }
          if (permission.location !== "granted") {
            throw { code: "OS-PLUG-GLOC-0003", message: "Permissão de localização negada." };
          }
          const nativeId = await NativeGeolocation.watchPosition(
            {
              enableHighAccuracy: options?.enableHighAccuracy ?? true,
              timeout: options?.timeout ?? 20000,
              maximumAge: options?.maximumAge ?? 0,
              minimumUpdateInterval: 5000,
              interval: 10000,
              enableLocationFallback: true,
            },
            (position, error) => {
              if (state.cancelled) return;
              if (error) {
                failure?.(toWebError(error));
                return;
              }
              if (position) success(toWebPosition(position));
            },
          );
          state.nativeId = nativeId;
          if (state.cancelled) {
            await NativeGeolocation.clearWatch({ id: nativeId });
            watches.delete(webId);
          }
        } catch (error) {
          if (!state.cancelled) failure?.(toWebError(error));
          watches.delete(webId);
        }
      })();
      return webId;
    },

    clearWatch(id) {
      const state = watches.get(id);
      if (!state) return;
      state.cancelled = true;
      if (state.nativeId) {
        void NativeGeolocation.clearWatch({ id: state.nativeId }).finally(() => watches.delete(id));
      }
    },
  };

  try {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      enumerable: true,
      value: adapter,
    });
  } catch {
    console.warn("Não foi possível instalar a ponte nativa de localização.");
  }
};
