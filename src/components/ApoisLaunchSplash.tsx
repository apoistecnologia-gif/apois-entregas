import { Bike, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getApoisProductMode } from "../lib/product-routing";

const SPLASH_MS = 1900;

export function ApoisLaunchSplash() {
  const product = getApoisProductMode();
  const isMobileProduct = product === "customer" || product === "courier";
  const [visible, setVisible] = useState(isMobileProduct);
  const label = product === "courier" ? "ENTREGADOR" : "CLIENTE";
  const Icon = product === "courier" ? Bike : ShoppingBag;

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
      role="status"
    >
      <div className="apois-launch-glow absolute h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="apois-launch-orbit absolute h-72 w-72 rounded-full border border-primary/15" />
      <div className="apois-launch-orbit apois-launch-orbit-2 absolute h-52 w-52 rounded-full border border-primary/25" />

      <div className="relative flex flex-col items-center">
        <div className="apois-launch-mark relative grid h-28 w-28 place-items-center rounded-[2rem] border border-primary/30 bg-zinc-950 shadow-[0_0_70px_rgba(250,204,21,0.18)]">
          <div className="absolute inset-2 rounded-[1.6rem] border border-primary/10" />
          <Icon className="h-12 w-12 text-primary" strokeWidth={2.2} />
          <span className="apois-launch-pulse absolute -right-1 -top-1 h-4 w-4 rounded-full bg-primary shadow-[0_0_22px_rgba(250,204,21,0.95)]" />
        </div>

        <div className="mt-8 text-center">
          <p className="apois-launch-brand text-[2.05rem] font-black tracking-[0.26em] text-primary">
            APOIS
          </p>
          <p className="apois-launch-label mt-2 text-[0.68rem] font-black tracking-[0.48em] text-zinc-300">
            {label}
          </p>
        </div>

        <div className="mt-10 h-[2px] w-36 overflow-hidden rounded-full bg-zinc-900">
          <div className="apois-launch-line h-full w-1/2 rounded-full bg-primary" />
        </div>
        <p className="apois-launch-copy mt-4 text-[0.68rem] font-semibold tracking-[0.14em] text-zinc-500">
          {product === "courier" ? "PRONTO PARA RODAR" : "TUDO PERTO DE VOCÊ"}
        </p>
      </div>
    </div>
  );
}
