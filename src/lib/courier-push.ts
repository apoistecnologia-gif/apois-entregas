import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications, type PushNotificationSchema } from "@capacitor/push-notifications";

import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";

const DELIVERY_CHANNEL_ID = "delivery_offers";
const REGISTRATION_TIMEOUT_MS = 12_000;

type RegistrationState =
  | { status: "not-native" }
  | { status: "permission-required" }
  | { status: "permission-denied" }
  | { status: "registered"; token: string }
  | { status: "failed"; message: string };

let listenersInstalled = false;
let notificationReceivedHandle: PluginListenerHandle | null = null;
let notificationActionHandle: PluginListenerHandle | null = null;
let registrationPromise: Promise<RegistrationState> | null = null;

export function isNativeCourierAndroid() {
  return (
    getApoisProductMode() === "courier" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android"
  );
}

async function persistAndroidToken(token: string) {
  const normalized = token.trim();
  if (!normalized) throw new Error("FCM registration returned an empty token.");

  const { error } = await (supabase.rpc as any)("register_courier_push_device", {
    _token: normalized,
    _platform: "android",
  });
  if (error) throw error;
}

async function ensureNotificationChannel() {
  await PushNotifications.createChannel({
    id: DELIVERY_CHANNEL_ID,
    name: "Chamadas de entrega",
    description: "Alertas de novas entregas disponíveis",
    importance: 5,
    visibility: 1,
    vibration: true,
  });
}

function emitCourierPush(notification?: PushNotificationSchema) {
  window.dispatchEvent(
    new CustomEvent("apois:courier-push", {
      detail: notification?.data ?? null,
    }),
  );
}

export async function installCourierPushListeners() {
  if (!isNativeCourierAndroid() || listenersInstalled) return;

  let receivedHandle: PluginListenerHandle | null = null;
  let actionHandle: PluginListenerHandle | null = null;
  try {
    receivedHandle = await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        emitCourierPush(notification);
      },
    );
    actionHandle = await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        emitCourierPush(action.notification);
        if (window.location.pathname !== "/courier") window.location.assign("/courier");
      },
    );

    notificationReceivedHandle = receivedHandle;
    notificationActionHandle = actionHandle;
    listenersInstalled = true;
  } catch (error) {
    await receivedHandle?.remove().catch(() => undefined);
    await actionHandle?.remove().catch(() => undefined);
    notificationReceivedHandle = null;
    notificationActionHandle = null;
    listenersInstalled = false;
    throw error;
  }
}

async function registerForPush(requestPermission: boolean): Promise<RegistrationState> {
  if (!isNativeCourierAndroid()) return { status: "not-native" };

  try {
    await installCourierPushListeners();
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Failed to install push listeners.",
    };
  }

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" && requestPermission) {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive === "prompt") return { status: "permission-required" };
  if (permission.receive !== "granted") return { status: "permission-denied" };

  try {
    await ensureNotificationChannel();
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Failed to create notification channel.",
    };
  }

  return await new Promise<RegistrationState>((resolve) => {
    let settled = false;
    let registrationHandle: PluginListenerHandle | null = null;
    let registrationErrorHandle: PluginListenerHandle | null = null;
    let timeoutId: number | null = null;

    const finish = (state: RegistrationState) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (registrationHandle) void registrationHandle.remove();
      if (registrationErrorHandle) void registrationErrorHandle.remove();
      resolve(state);
    };

    const setup = async () => {
      registrationHandle = await PushNotifications.addListener(
        "registration",
        async ({ value }) => {
          try {
            await persistAndroidToken(value);
            finish({ status: "registered", token: value });
          } catch (error) {
            finish({
              status: "failed",
              message: error instanceof Error ? error.message : "Failed to persist push token.",
            });
          }
        },
      );

      registrationErrorHandle = await PushNotifications.addListener(
        "registrationError",
        ({ error }) => {
          finish({
            status: "failed",
            message: String(error || "Android push registration failed."),
          });
        },
      );

      timeoutId = window.setTimeout(
        () => finish({ status: "failed", message: "Android push registration timed out." }),
        REGISTRATION_TIMEOUT_MS,
      );

      try {
        await PushNotifications.register();
      } catch (error) {
        finish({
          status: "failed",
          message: error instanceof Error ? error.message : "Android push registration failed.",
        });
      }
    };

    void setup().catch((error) => {
      finish({
        status: "failed",
        message: error instanceof Error ? error.message : "Android push registration failed.",
      });
    });
  });
}

export function ensureCourierPushRegistration(requestPermission = false) {
  if (!isNativeCourierAndroid())
    return Promise.resolve<RegistrationState>({ status: "not-native" });
  if (registrationPromise) return registrationPromise;
  registrationPromise = registerForPush(requestPermission).finally(() => {
    registrationPromise = null;
  });
  return registrationPromise;
}

export async function removeCourierPushRegistration() {
  if (!isNativeCourierAndroid()) return;

  let backendRemovalError: unknown = null;
  try {
    const { error } = await (supabase.rpc as any)("remove_courier_push_devices");
    if (error) backendRemovalError = error;
  } catch (error) {
    backendRemovalError = error;
  }

  // Always unregister the local FCM installation, even when the backend is
  // temporarily unreachable. This prevents a signed-out device from continuing
  // to present a live local registration while server cleanup is retried later.
  try {
    await PushNotifications.unregister();
  } catch (error) {
    console.warn(
      "courier local push unregister failed",
      error instanceof Error ? error.message : "unknown",
    );
  }

  await removeCourierPushListeners();

  if (backendRemovalError) {
    console.warn(
      "courier backend push cleanup pending",
      backendRemovalError instanceof Error ? backendRemovalError.message : "unknown",
    );
  }
}

export async function removeCourierPushListeners() {
  await notificationReceivedHandle?.remove().catch(() => undefined);
  await notificationActionHandle?.remove().catch(() => undefined);
  notificationReceivedHandle = null;
  notificationActionHandle = null;
  listenersInstalled = false;
}

export { DELIVERY_CHANNEL_ID };
