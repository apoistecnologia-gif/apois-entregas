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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Courier authentication is required for push registration.");

  const { error: deleteError } = await supabase
    .from("push_devices")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", "android")
    .neq("token", normalized);
  if (deleteError) throw deleteError;

  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("push_devices").upsert(
    {
      user_id: user.id,
      platform: "android",
      token: normalized,
      is_active: true,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "token" },
  );
  if (insertError) throw insertError;
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
  listenersInstalled = true;

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    emitCourierPush(notification);
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    emitCourierPush(action.notification);
    if (window.location.pathname !== "/courier") window.location.assign("/courier");
  });
}

async function registerForPush(requestPermission: boolean): Promise<RegistrationState> {
  if (!isNativeCourierAndroid()) return { status: "not-native" };

  await installCourierPushListeners();

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" && requestPermission) {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive === "prompt") return { status: "permission-required" };
  if (permission.receive !== "granted") return { status: "permission-denied" };

  await ensureNotificationChannel();

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
      registrationHandle = await PushNotifications.addListener("registration", async ({ value }) => {
        try {
          await persistAndroidToken(value);
          finish({ status: "registered", token: value });
        } catch (error) {
          finish({
            status: "failed",
            message: error instanceof Error ? error.message : "Failed to persist push token.",
          });
        }
      });

      registrationErrorHandle = await PushNotifications.addListener("registrationError", ({ error }) => {
        finish({
          status: "failed",
          message: String(error || "Android push registration failed."),
        });
      });

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
  if (!isNativeCourierAndroid()) return Promise.resolve<RegistrationState>({ status: "not-native" });
  if (registrationPromise) return registrationPromise;
  registrationPromise = registerForPush(requestPermission).finally(() => {
    registrationPromise = null;
  });
  return registrationPromise;
}

export async function removeCourierPushRegistration() {
  if (!isNativeCourierAndroid()) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("push_devices").delete().eq("user_id", user.id).eq("platform", "android");
  }

  try {
    await PushNotifications.unregister();
  } catch {
    // Removing the backend token is authoritative for user-targeted pushes.
  }
}

export { DELIVERY_CHANNEL_ID };
