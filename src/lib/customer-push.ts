import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications, type PushNotificationSchema } from "@capacitor/push-notifications";

import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";

const CUSTOMER_CHANNEL_ID = "order_updates";
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

export function isNativeCustomerAndroid() {
  return (
    getApoisProductMode() === "customer" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android"
  );
}

async function persistAndroidToken(token: string) {
  const normalized = token.trim();
  if (!normalized) throw new Error("FCM registration returned an empty token.");

  const { error } = await (supabase.rpc as any)("register_customer_push_device", {
    _token: normalized,
    _platform: "android",
  });
  if (error) throw error;
}

async function ensureNotificationChannel() {
  await PushNotifications.createChannel({
    id: CUSTOMER_CHANNEL_ID,
    name: "Atualizações de pedidos",
    description: "Pagamento, preparo, entrega e demais atualizações dos seus pedidos",
    importance: 4,
    visibility: 1,
    vibration: true,
  });
}

function notificationTarget(notification?: PushNotificationSchema) {
  const orderId = notification?.data?.["orderId"];
  return typeof orderId === "string" && orderId.trim()
    ? `/pedido/${encodeURIComponent(orderId)}`
    : "/notificacoes";
}

export async function installCustomerPushListeners() {
  if (!isNativeCustomerAndroid() || listenersInstalled) return;

  let receivedHandle: PluginListenerHandle | null = null;
  let actionHandle: PluginListenerHandle | null = null;
  try {
    receivedHandle = await PushNotifications.addListener("pushNotificationReceived", () => {
      window.dispatchEvent(new CustomEvent("apois:customer-push"));
    });
    actionHandle = await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const target = notificationTarget(action.notification);
        if (window.location.pathname !== target) window.location.assign(target);
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
  if (!isNativeCustomerAndroid()) return { status: "not-native" };

  try {
    await installCustomerPushListeners();
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

export function ensureCustomerPushRegistration(requestPermission = false) {
  if (!isNativeCustomerAndroid())
    return Promise.resolve<RegistrationState>({ status: "not-native" });
  if (registrationPromise) return registrationPromise;
  registrationPromise = registerForPush(requestPermission).finally(() => {
    registrationPromise = null;
  });
  return registrationPromise;
}

export async function removeCustomerPushRegistration(removeBackend = true) {
  if (!isNativeCustomerAndroid()) return;

  if (removeBackend) {
    try {
      const { error } = await (supabase.rpc as any)("remove_customer_push_devices");
      if (error) throw error;
    } catch (error) {
      console.warn(
        "customer backend push cleanup pending",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }

  try {
    await PushNotifications.unregister();
  } catch (error) {
    console.warn(
      "customer local push unregister failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
  await removeCustomerPushListeners();
}

export async function removeCustomerPushListeners() {
  await notificationReceivedHandle?.remove().catch(() => undefined);
  await notificationActionHandle?.remove().catch(() => undefined);
  notificationReceivedHandle = null;
  notificationActionHandle = null;
  listenersInstalled = false;
}

export { CUSTOMER_CHANNEL_ID };
