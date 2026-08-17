#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve("android/app/src/main/AndroidManifest.xml");
const drawableDir = resolve("android/app/src/main/res/drawable");
const iconPath = resolve(drawableDir, "apois_launcher.xml");

mkdirSync(drawableDir, { recursive: true });

const iconXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#111111" android:pathData="M0,0h108v108h-108z" />
    <path android:fillColor="#6A1B9A" android:fillType="evenOdd" android:pathData="M54,13a31,31 0,1 1,0,62a31,31 0,1 1,0,-62M54,22a22,22 0,1 0,0,44a22,22 0,1 0,0,-44" />
    <path android:fillColor="#111111" android:pathData="M17,51h20v18h-20z" />
    <path android:fillColor="#39B54A" android:pathData="M54,31c-9,0 -16,7 -16,16c0,12 16,31 16,31s16,-19 16,-31c0,-9 -7,-16 -16,-16M54,53a6,6 0,1 1,0,-12a6,6 0,1 1,0,12" />
    <path android:fillColor="#39B54A" android:pathData="M13,35h18a3,3 0,0 1,0,6h-18a3,3 0,0 1,0,-6M13,45h14a3,3 0,0 1,0,6h-14a3,3 0,0 1,0,-6M13,55h10a3,3 0,0 1,0,6h-10a3,3 0,0 1,0,-6" />
</vector>
`;

writeFileSync(iconPath, iconXml, "utf8");

let manifest = readFileSync(manifestPath, "utf8");
manifest = manifest.replace(/android:icon="[^"]+"/, 'android:icon="@drawable/apois_launcher"');
if (/android:roundIcon="[^"]+"/.test(manifest)) {
  manifest = manifest.replace(/android:roundIcon="[^"]+"/, 'android:roundIcon="@drawable/apois_launcher"');
} else {
  manifest = manifest.replace("<application", '<application android:roundIcon="@drawable/apois_launcher"');
}
writeFileSync(manifestPath, manifest, "utf8");

if (!manifest.includes('@drawable/apois_launcher')) {
  throw new Error("Falha ao aplicar o ícone oficial APOIS no AndroidManifest.xml");
}

console.log("Branding Android aplicado:");
console.log("- ícone oficial roxo/verde");
console.log("- fundo #111111");
console.log("- launcher e round launcher");
