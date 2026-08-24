import { useEffect, useMemo, useState } from "react";

import { getApoisProductMode } from "../lib/product-routing";

const SPLASH_MS = 1900;

export function ApoisLaunchSplash() {
  const product = getApoisProductMode();
  const isMobileProduct = product === "customer" || product === "courier";
  const [visible, setVisible] = useState(isMobileProduct);
  const label = product === "courier" ? "ENTREGADOR" : "CLIENTE";

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  useEffect(() => {
    if (!isMobileProduct) return;
    const timeout = window.setTimeout(
      () => setVisible(false),
      prefersReducedMotion ? 450 : SPLASH_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [isMobileProduct, prefersReducedMotion]);

  if (!visible || !isMobileProduct) return null;

  return (
    <div
      className="apois-launch fixed inset-0 z-[9999] grid place-items-center overflow-hidden bg-black text-white"
      aria-label={`Abrindo APOIS ${label.toLowerCase()}`}
      aria-live="polite"
      role="status"
    >
      <div className="apois-launch-glow absolute h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
      <div className="apois-launch-orbit absolute h-72 w-72 rounded-full border border-accent/20" />
      <div className="apois-launch-orbit apois-launch-orbit-2 absolute h-52 w-52 rounded-full border border-primary/25" />

      <div className="relative flex flex-col items-center">
        <div className="apois-launch-mark relative grid h-28 w-28 place-items-center overflow-hidden rounded-[2rem] border border-accent/40 bg-[#111111] shadow-[0_0_70px_rgba(200,138,8,0.28)]">
          <img
            src="/apois-app-icon.png"
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
          />
          <span className="apois-launch-pulse absolute right-2 top-2 h-3.5 w-3.5 rounded-full bg-primary shadow-[0_0_22px_rgba(246,190,28,0.92)]" />
        </div>

        <div className="mt-8 text-center">
          <p className="apois-launch-brand bg-gradient-to-r from-primary to-accent bg-clip-text text-[2.05rem] font-black tracking-[0.26em] text-transparent">
            APOIS
          </p>
          <p className="apois-launch-label mt-2 text-[0.68rem] font-black tracking-[0.48em] text-zinc-300">
            {label}
          </p>
        </div>

        <div className="mt-10 h-[2px] w-36 overflow-hidden rounded-full bg-zinc-900">
          <div className="apois-launch-line h-full w-1/2 rounded-full bg-gradient-to-r from-primary to-accent" />
        </div>
        <p className="apois-launch-copy mt-4 text-[0.68rem] font-semibold tracking-[0.14em] text-zinc-500">
          {product === "courier" ? "PRONTO PARA RODAR" : "TUDO PERTO DE VOCÊ"}
        </p>
      </div>
    </div>
  );
}
