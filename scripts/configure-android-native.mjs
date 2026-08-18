#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve("android/app/src/main/AndroidManifest.xml");

if (!existsSync(manifestPath)) {
  console.error("AndroidManifest.xml not found. Run `npx cap add android` first.");
  process.exit(1);
}

let manifest = readFileSync(manifestPath, "utf8");
const manifestTag = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">';

if (!manifest.includes(manifestTag)) {
  console.error("Unexpected AndroidManifest.xml format.");
  process.exit(1);
}

const requiredEntries = [
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
  '<uses-feature android:name="android.hardware.location.gps" android:required="false" />',
];

const missingEntries = requiredEntries.filter((entry) => !manifest.includes(entry));
if (missingEntries.length > 0) {
  manifest = manifest.replace(
    manifestTag,
    `${manifestTag}\n    ${missingEntries.join("\n    ")}`,
  );
}

if (!manifest.includes('android:usesCleartextTraffic="false"')) {
  manifest = manifest.replace("<application", '<application android:usesCleartextTraffic="false"');
}

const mobileProduct = String(process.env.APOIS_MOBILE_PRODUCT ?? "courier")
  .trim()
  .toLowerCase();

const customerOauthIntentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="br.com.apois.cliente"
                    android:host="auth"
                    android:pathPrefix="/callback" />
            </intent-filter>`;

if (mobileProduct === "customer" && !manifest.includes('android:scheme="br.com.apois.cliente"')) {
  const activityCloseIndex = manifest.indexOf("</activity>");
  if (activityCloseIndex === -1) {
    console.error("Main Android activity not found while configuring OAuth deep link.");
    process.exit(1);
  }

  manifest = `${manifest.slice(0, activityCloseIndex)}${customerOauthIntentFilter}\n        ${manifest.slice(activityCloseIndex)}`;
}

writeFileSync(manifestPath, manifest, "utf8");

const hasFine = manifest.includes("android.permission.ACCESS_FINE_LOCATION");
const hasCoarse = manifest.includes("android.permission.ACCESS_COARSE_LOCATION");

if (!hasFine || !hasCoarse) {
  console.error("Failed to configure Android location permissions.");
  process.exit(1);
}

if (mobileProduct === "customer" && !manifest.includes('android:scheme="br.com.apois.cliente"')) {
  console.error("Failed to configure the customer Google OAuth deep link.");
  process.exit(1);
}

console.log("Android native configuration updated:");
console.log("- ACCESS_FINE_LOCATION");
console.log("- ACCESS_COARSE_LOCATION");
console.log("- VIBRATE");
console.log("- optional GPS feature");
console.log("- cleartext traffic disabled");
if (mobileProduct === "customer") {
  console.log("- customer OAuth deep link: br.com.apois.cliente://auth/callback");
}
