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

writeFileSync(manifestPath, manifest, "utf8");

const hasFine = manifest.includes("android.permission.ACCESS_FINE_LOCATION");
const hasCoarse = manifest.includes("android.permission.ACCESS_COARSE_LOCATION");

if (!hasFine || !hasCoarse) {
  console.error("Failed to configure Android location permissions.");
  process.exit(1);
}

console.log("Android native configuration updated:");
console.log("- ACCESS_FINE_LOCATION");
console.log("- ACCESS_COARSE_LOCATION");
console.log("- VIBRATE");
console.log("- optional GPS feature");
console.log("- cleartext traffic disabled");
