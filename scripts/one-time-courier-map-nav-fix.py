from pathlib import Path

route = Path('src/routes/courier.tsx')
text = route.read_text(encoding='utf-8')

text = text.replace(
    'import { CourierRouteMap } from "@/components/CourierRouteMap";',
    'import { CourierLiveMap, CourierRouteMap } from "@/components/CourierRouteMap";',
    1,
)

old = '''  if (historyOpen) {
    return <CourierHistoryPanel jobs={deliveryHistory} onClose={() => setHistoryOpen(false)} />;
  }
'''
new = '''  if (historyOpen) {
    return (
      <>
        <CourierHistoryPanel jobs={deliveryHistory} onClose={() => setHistoryOpen(false)} />
        <CourierBottomNav
          onHome={() => setHistoryOpen(false)}
          onHistory={() => undefined}
          onFinance={() => {
            setHistoryOpen(false);
            setFinanceOpen(true);
          }}
          onProfile={() => {
            setHistoryOpen(false);
            setProfileOpen(true);
          }}
        />
      </>
    );
  }
'''
if old not in text:
    raise SystemExit('history branch not found')
text = text.replace(old, new, 1)

old = '''  if (profileOpen) {
    return (
      <CourierProfilePanel
        courier={courier}
        user={user}
        documents={documents}
        availability={availability}
        wallet={wallet}
        onFinance={() => {
          setProfileOpen(false);
          setFinanceOpen(true);
        }}
        onLogout={() => void logout()}
        onClose={() => setProfileOpen(false)}
      />
    );
  }
'''
new = '''  if (profileOpen) {
    return (
      <>
        <CourierProfilePanel
          courier={courier}
          user={user}
          documents={documents}
          availability={availability}
          wallet={wallet}
          onFinance={() => {
            setProfileOpen(false);
            setFinanceOpen(true);
          }}
          onLogout={() => void logout()}
          onClose={() => setProfileOpen(false)}
        />
        <CourierBottomNav
          onHome={() => setProfileOpen(false)}
          onHistory={() => {
            setProfileOpen(false);
            setHistoryOpen(true);
          }}
          onFinance={() => {
            setProfileOpen(false);
            setFinanceOpen(true);
          }}
          onProfile={() => undefined}
        />
      </>
    );
  }
'''
if old not in text:
    raise SystemExit('profile branch not found')
text = text.replace(old, new, 1)

old = '''  if (financeOpen) {
    return (
      <CourierFinance
        courier={courier}
        wallet={wallet}
        metrics={metrics}
        transactions={transactions}
        payoutAccount={payoutAccount}
        payouts={payouts}
        draft={payoutDraft}
        setDraft={setPayoutDraft}
        busy={busy}
        onSaveAccount={savePayoutAccount}
        onRequestPayout={requestPayout}
        onClose={() => setFinanceOpen(false)}
      />
    );
  }
'''
new = '''  if (financeOpen) {
    return (
      <>
        <CourierFinance
          courier={courier}
          wallet={wallet}
          metrics={metrics}
          transactions={transactions}
          payoutAccount={payoutAccount}
          payouts={payouts}
          draft={payoutDraft}
          setDraft={setPayoutDraft}
          busy={busy}
          onSaveAccount={savePayoutAccount}
          onRequestPayout={requestPayout}
          onClose={() => setFinanceOpen(false)}
        />
        <CourierBottomNav
          onHome={() => setFinanceOpen(false)}
          onHistory={() => {
            setFinanceOpen(false);
            setHistoryOpen(true);
          }}
          onFinance={() => undefined}
          onProfile={() => {
            setFinanceOpen(false);
            setProfileOpen(true);
          }}
        />
      </>
    );
  }
'''
if old not in text:
    raise SystemExit('finance branch not found')
text = text.replace(old, new, 1)

old = '''        <CourierLocationTracker
          enabled={Boolean(availability?.is_online)}
          onPosition={setCurrentPosition}
        />

        <div className="grid grid-cols-2 gap-3">'''
new = '''        <CourierLocationTracker
          enabled={Boolean(availability?.is_online)}
          onPosition={setCurrentPosition}
        />

        {availability?.is_online && !activeJob ? (
          <CourierLiveMap currentPosition={currentPosition} />
        ) : null}

        <div className="grid grid-cols-2 gap-3">'''
if old not in text:
    raise SystemExit('tracker insertion point not found')
text = text.replace(old, new, 1)

route.write_text(text, encoding='utf-8')

panels = Path('src/components/CourierPanels.tsx')
ptext = panels.read_text(encoding='utf-8')
ptext = ptext.replace('className="space-y-3 p-4 pb-20"', 'className="space-y-3 p-4 pb-28"', 1)
ptext = ptext.replace('className="space-y-4 p-4 pb-20"', 'className="space-y-4 p-4 pb-28"', 1)
panels.write_text(ptext, encoding='utf-8')

map_path = Path('src/components/CourierRouteMap.tsx')
mtext = map_path.read_text(encoding='utf-8')
marker = 'export function CourierRouteMap({' 
if marker not in mtext:
    raise SystemExit('CourierRouteMap marker not found')

live_component = r'''export function CourierLiveMap({ currentPosition }: { currentPosition: CourierPosition | null }) {
  const browserKey = (import.meta as any).env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const mapId = (import.meta as any).env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-900 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-primary">Mapa em tempo real</p>
        <p className="mt-1 text-xs text-zinc-500">
          {currentPosition
            ? "Sua posição está sendo atualizada enquanto você estiver online."
            : "Obtendo sua localização para exibir o mapa..."}
        </p>
      </div>
      {browserKey && mapId && currentPosition ? (
        <APIProvider apiKey={browserKey}>
          <div className="h-64 w-full bg-zinc-900">
            <Map
              center={{ lat: currentPosition.lat, lng: currentPosition.lng }}
              zoom={15}
              gestureHandling="greedy"
              disableDefaultUI
              mapId={mapId}
            >
              <AdvancedMarker position={{ lat: currentPosition.lat, lng: currentPosition.lng }}>
                <div className="grid h-9 w-9 place-items-center rounded-full border-4 border-white bg-primary shadow-xl">
                  <Navigation className="h-4 w-4 fill-black text-black" />
                </div>
              </AdvancedMarker>
            </Map>
          </div>
        </APIProvider>
      ) : (
        <div className="grid h-48 place-items-center px-6 text-center text-sm text-zinc-500">
          {browserKey && mapId
            ? "Aguardando o GPS retornar sua posição atual."
            : "Mapa indisponível: configuração do Google Maps não foi carregada."}
        </div>
      )}
    </section>
  );
}

'''
mtext = mtext.replace(marker, live_component + marker, 1)
map_path.write_text(mtext, encoding='utf-8')
