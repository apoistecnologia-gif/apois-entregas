from pathlib import Path

# 1) Checkout: leave PIX screen immediately when payment is confirmed.
p = Path('src/routes/checkout.tsx')
s = p.read_text()
old = '''    const finishPayment = () => {
      if (disposed || completed) return;
      completed = true;
      setPaymentStatus("paid");
      onPaymentConfirmed();
      toast.success("Pagamento confirmado!");
      redirectTimer = window.setTimeout(() => {
        navigate({ to: "/pedido/confirmado", search: { orderId: pixData.orderId } });
      }, 650);
    };'''
new = '''    const finishPayment = () => {
      if (disposed || completed) return;
      completed = true;
      setPaymentStatus("paid");
      toast.success("Pagamento confirmado!");
      void navigate({
        to: "/pedido/$orderId/",
        params: { orderId: pixData.orderId },
        replace: true,
      });
      onPaymentConfirmed();
    };'''
if old not in s:
    raise SystemExit('checkout finishPayment pattern not found')
s = s.replace(old, new)
s = s.replace('    let redirectTimer: number | undefined;\n', '')
s = s.replace('      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);\n', '')
p.write_text(s)

# 2) Customer order tracking: reveal delivery PIN only when courier actually arrived.
p = Path('src/routes/pedido/$orderId/index.tsx')
s = p.read_text()
old = '''    if (nextOrder.fulfillment_type === "delivery") {
      const { data, error } = await (supabase.from as any)("delivery_jobs")
        .select("id,courier_id,status,delivery_latitude,delivery_longitude")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) console.warn("Não foi possível carregar o rastreamento da entrega:", error.code);
      setDeliveryJob(data ?? null);
      setPickupPin(null);
    } else {'''
new = '''    if (nextOrder.fulfillment_type === "delivery") {
      const { data: jobData, error } = await (supabase.from as any)("delivery_jobs")
        .select("id,courier_id,status,delivery_latitude,delivery_longitude")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) console.warn("Não foi possível carregar o rastreamento da entrega:", error.code);
      setDeliveryJob(jobData ?? null);

      if (jobData?.status === "arrived_destination") {
        const { data: secretData, error: secretError } = await (supabase.from as any)(
          "delivery_confirmation_secrets",
        )
          .select("pin_code,locked_until")
          .eq("order_id", orderId)
          .maybeSingle();
        if (secretError) console.warn("PIN de entrega indisponível:", secretError.code);
        setPickupPin(secretData?.pin_code ?? null);
      } else {
        setPickupPin(null);
      }
    } else {'''
if old not in s:
    raise SystemExit('customer delivery fetch pattern not found')
s = s.replace(old, new)
insert_before = '''        {pickupReady ? ('''
delivery_pin = '''        {!isPickup && deliveryJob?.status === "arrived_destination" ? (
          <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-black">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-primary">
                  Entregador chegou
                </p>
                <h2 className="mt-1 text-lg font-black">Informe este PIN ao entregador</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Só informe o código quando estiver com o pedido em mãos. Ele confirma a conclusão da entrega.
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-zinc-800 bg-black p-5 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
                Código de entrega
              </p>
              <p className="mt-2 text-4xl font-black tracking-[0.35em] text-primary">
                {pickupPin ?? "••••"}
              </p>
              {!pickupPin ? (
                <p className="mt-2 text-xs text-zinc-500">Atualizando seu PIN com segurança...</p>
              ) : null}
            </div>
          </section>
        ) : null}

'''
if insert_before not in s:
    raise SystemExit('customer PIN insertion point not found')
s = s.replace(insert_before, delivery_pin + insert_before, 1)
p.write_text(s)

# 3) Courier map: make navigation visually dominant and cleaner during active route.
p = Path('src/components/CourierRouteMap.tsx')
s = p.read_text()
s = s.replace(
    'className={`relative w-full bg-zinc-900 ${expanded ? "h-[31rem] min-h-[64vh] max-h-[38rem]" : "h-[23rem] min-h-[50vh] max-h-[29rem]"}`}',
    'className={`relative w-full bg-zinc-900 ${expanded ? "h-[36rem] min-h-[72vh] max-h-[44rem]" : "h-[29rem] min-h-[62vh] max-h-[36rem]"}`}',
)
s = s.replace('map.fitBounds(bounds, 42);', 'map.fitBounds(bounds, { top: 64, right: 38, bottom: 72, left: 38 });')
s = s.replace(
    'className="flex items-center justify-between gap-3 border-b border-primary/10 bg-zinc-950/95 p-3.5"',
    'className="flex items-center justify-between gap-3 border-b border-primary/10 bg-black/95 p-3"',
)
s = s.replace(
    'className="grid grid-cols-2 divide-x divide-zinc-800 border-b border-zinc-900 bg-black/95"',
    'className="grid grid-cols-2 divide-x divide-zinc-800 border-b border-zinc-900 bg-black"',
)
p.write_text(s)
