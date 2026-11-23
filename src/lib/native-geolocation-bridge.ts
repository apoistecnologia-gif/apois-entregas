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
  requestPermissions: (options?: {
    permissions?: Array<"location" | "coarseLocation">;
  }) => Promise<{
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
    callback: (
      position: NativePosition | null,
      error?: { code?: string; message?: string },
    ) => void,
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

const ensureNativeLocationPermission = async () => {
  let permission = await NativeGeolocation.checkPermissions();
  if (permission.location !== "granted") {
    permission = await NativeGeolocation.requestPermissions({
      permissions: ["location", "coarseLocation"],
    });
  }
  if (permission.location !== "granted") {
    throw { code: "OS-PLUG-GLOC-0003", message: "Permissão de localização negada." };
  }
};

const getBestCurrentPosition = async (options?: PositionOptions) => {
  const highAccuracy = options?.enableHighAccuracy ?? true;
  const timeout = options?.timeout ?? 20000;
  const maximumAge = options?.maximumAge ?? 0;

  try {
    return await NativeGeolocation.getCurrentPosition({
      enableHighAccuracy: highAccuracy,
      timeout,
      maximumAge,
      enableLocationFallback: true,
    });
  } catch (firstError) {
    if (!highAccuracy) throw firstError;

    return NativeGeolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: Math.max(10000, Math.min(timeout, 15000)),
      maximumAge: Math.max(maximumAge, 60000),
      enableLocationFallback: true,
    });
  }
};

const primeCourierLocationPermission = () => {
  const productMode = String((import.meta as any).env?.VITE_APOIS_PRODUCT_MODE ?? "");
  if (productMode !== "courier" || typeof window === "undefined") return;

  // Solicita no primeiro uso do app do entregador, já com a Activity visível.
  // O atraso curto evita pedir permissão enquanto o WebView ainda está inicializando.
  window.setTimeout(() => {
    void NativeGeolocation.checkPermissions()
      .then((permission) => {
        if (permission.location === "prompt" || permission.location === "prompt-with-rationale") {
          return NativeGeolocation.requestPermissions({
            permissions: ["location", "coarseLocation"],
          });
        }
        return permission;
      })
      .catch((error) => {
        console.warn("Não foi possível solicitar a localização na abertura:", error);
      });
  }, 900);
};

export const installNativeGeolocationBridge = () => {
  if (
    typeof navigator === "undefined" ||
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== "android"
  ) {
    return;
  }

  primeCourierLocationPermission();

  let nextWatchId = 1;
  const watches = new Map<
    number,
    { nativeId: string | undefined; cancelled: boolean; hasPosition: boolean }
  >();

  const adapter: Geolocation = {
    getCurrentPosition(success, failure, options) {
      void (async () => {
        try {
          await ensureNativeLocationPermission();
          const position = await getBestCurrentPosition(options);
          success(toWebPosition(position));
        } catch (error) {
          failure?.(toWebError(error));
        }
      })();
    },

    watchPosition(success, failure, options) {
      const webId = nextWatchId++;
      const state = {
        cancelled: false as boolean,
        nativeId: undefined as string | undefined,
        hasPosition: false,
      };
      watches.set(webId, state);

      void (async () => {
        try {
          await ensureNativeLocationPermission();

          try {
            const initial = await getBestCurrentPosition({
              enableHighAccuracy: options?.enableHighAccuracy ?? true,
              timeout: options?.timeout ?? 20000,
              maximumAge: Math.max(options?.maximumAge ?? 0, 30000),
            });
            if (!state.cancelled) {
              state.hasPosition = true;
              success(toWebPosition(initial));
            }
          } catch (initialError) {
            const webError = toWebError(initialError);
            if (webError.code === webError.PERMISSION_DENIED) {
              throw initialError;
            }
            console.warn("Posição inicial nativa indisponível; iniciando rastreamento contínuo.");
          }

          if (state.cancelled) {
            watches.delete(webId);
            return;
          }

          const nativeId = await NativeGeolocation.watchPosition(
            {
              enableHighAccuracy: options?.enableHighAccuracy ?? true,
              timeout: options?.timeout ?? 20000,
              maximumAge: Math.max(options?.maximumAge ?? 0, 30000),
              minimumUpdateInterval: 5000,
              interval: 10000,
              enableLocationFallback: true,
            },
            (position, error) => {
              if (state.cancelled) return;

              if (position) {
                state.hasPosition = true;
                success(toWebPosition(position));
                return;
              }

              if (!error) return;
              const webError = toWebError(error);

              if (webError.code === webError.PERMISSION_DENIED) {
                failure?.(webError);
                return;
              }

              if (state.hasPosition) {
                console.warn("Falha transitória no rastreamento nativo:", error.code);
                return;
              }

              void getBestCurrentPosition({
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 60000,
              })
                .then((fallbackPosition) => {
                  if (state.cancelled) return;
                  state.hasPosition = true;
                  success(toWebPosition(fallbackPosition));
                })
                .catch((fallbackError) => {
                  if (!state.cancelled && !state.hasPosition) {
                    failure?.(toWebError(fallbackError));
                  }
                });
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
      } else {
        watches.delete(id);
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
