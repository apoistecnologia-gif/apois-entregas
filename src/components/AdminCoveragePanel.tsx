import { CirclePlus, Loader2, MapPinned, Pencil, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard } from "@/components/WorkspaceShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type City = {
  id: string;
  name: string;
  state: string;
  timezone?: string | null;
  is_active: boolean;
  default_delivery_radius_km: number | string;
};

type DeliveryZone = {
  id: string;
  city_id: string;
  name: string;
  geojson: unknown | null;
  center_latitude: number | string | null;
  center_longitude: number | string | null;
  radius_km: number | string | null;
  delivery_fee: number | string;
  minimum_order: number | string;
  is_active: boolean;
};

type ZoneDraft = {
  id: string | null;
  mode: "radius" | "polygon";
  name: string;
  centerLatitude: string;
  centerLongitude: string;
  radiusKm: string;
  geojson: string;
  deliveryFee: string;
  minimumOrder: string;
  isActive: boolean;
};

const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});
const from = (table: string) => (supabase.from as any)(table);
const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;

const emptyZoneDraft = (): ZoneDraft => ({
  id: null,
  mode: "radius",
  name: "",
  centerLatitude: "",
  centerLongitude: "",
  radiusKm: "5",
  geojson: "",
  deliveryFee: "0",
  minimumOrder: "0",
  isActive: true,
});

export function AdminCoveragePanel({
  cities,
  onRefresh,
}: {
  cities: City[];
  onRefresh: () => Promise<void> | void;
}) {
  const [selectedCityId, setSelectedCityId] = useState<string>(cities[0]?.id ?? "");
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [newCity, setNewCity] = useState({
    name: "",
    state: "",
    timezone: "America/Sao_Paulo",
    radius: "12",
    active: false,
  });
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft>(emptyZoneDraft);

  useEffect(() => {
    if (!selectedCityId && cities[0]?.id) setSelectedCityId(cities[0].id);
    if (selectedCityId && !cities.some((city) => city.id === selectedCityId))
      setSelectedCityId(cities[0]?.id ?? "");
  }, [cities, selectedCityId]);

  const selectedCity = useMemo(
    () => cities.find((city) => city.id === selectedCityId) ?? null,
    [cities, selectedCityId],
  );

  const loadZones = async () => {
    if (!selectedCityId) {
      setZones([]);
      return;
    }
    setLoadingZones(true);
    const { data, error } = await from("delivery_zones")
      .select("*")
      .eq("city_id", selectedCityId)
      .order("name");
    setLoadingZones(false);
    if (error) {
      toast.error("Não foi possível carregar as zonas de entrega.");
      setZones([]);
      return;
    }
    setZones((data ?? []) as DeliveryZone[]);
  };

  useEffect(() => {
    void loadZones();
  }, [selectedCityId]);

  const saveCity = async (city: City) => {
    const radius = Number(city.default_delivery_radius_km);
    if (!city.name.trim()) return toast.error("Informe o nome da cidade.");
    if (city.state.trim().length !== 2) return toast.error("Informe a UF com 2 caracteres.");
    if (!Number.isFinite(radius) || radius <= 0) return toast.error("Informe um raio padrão válido.");
    setBusy(`city:${city.id}`);
    const { error } = await rpc("admin_update_city", {
      _city_id: city.id,
      _name: city.name.trim(),
      _state: city.state.trim().toUpperCase(),
      _timezone: city.timezone || "America/Sao_Paulo",
      _default_delivery_radius_km: radius,
      _is_active: city.is_active,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível atualizar a cidade.");
    toast.success("Cidade atualizada.");
    setEditingCity(null);
    await onRefresh();
  };

  const createCity = async (event: React.FormEvent) => {
    event.preventDefault();
    const radius = Number(newCity.radius);
    if (!newCity.name.trim()) return toast.error("Informe o nome da cidade.");
    if (newCity.state.trim().length !== 2) return toast.error("Informe a UF com 2 caracteres.");
    if (!Number.isFinite(radius) || radius <= 0) return toast.error("Informe um raio padrão válido.");
    setBusy("new-city");
    const { data, error } = await rpc("admin_create_city", {
      _name: newCity.name.trim(),
      _state: newCity.state.trim().toUpperCase(),
      _timezone: newCity.timezone || "America/Sao_Paulo",
      _default_delivery_radius_km: radius,
      _is_active: newCity.active,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível cadastrar a cidade.");
    toast.success("Cidade cadastrada.");
    setNewCity({
      name: "",
      state: "",
      timezone: "America/Sao_Paulo",
      radius: "12",
      active: false,
    });
    await onRefresh();
    if (data) setSelectedCityId(String(data));
  };

  const editZone = (zone: DeliveryZone) => {
    setZoneDraft({
      id: zone.id,
      mode: zone.geojson ? "polygon" : "radius",
      name: zone.name,
      centerLatitude: zone.center_latitude === null ? "" : String(zone.center_latitude),
      centerLongitude: zone.center_longitude === null ? "" : String(zone.center_longitude),
      radiusKm: zone.radius_km === null ? "" : String(zone.radius_km),
      geojson: zone.geojson ? JSON.stringify(zone.geojson, null, 2) : "",
      deliveryFee: String(zone.delivery_fee ?? 0),
      minimumOrder: String(zone.minimum_order ?? 0),
      isActive: zone.is_active,
    });
  };

  const saveZone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCityId) return toast.error("Selecione uma cidade.");
    const deliveryFee = Number(zoneDraft.deliveryFee || 0);
    const minimumOrder = Number(zoneDraft.minimumOrder || 0);
    const latitude = zoneDraft.mode === "radius" ? Number(zoneDraft.centerLatitude) : null;
    const longitude = zoneDraft.mode === "radius" ? Number(zoneDraft.centerLongitude) : null;
    const radius = zoneDraft.mode === "radius" ? Number(zoneDraft.radiusKm) : null;
    let geojson: unknown = null;

    if (!zoneDraft.name.trim()) return toast.error("Informe o nome da zona.");
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0)
      return toast.error("Taxa de entrega inválida.");
    if (!Number.isFinite(minimumOrder) || minimumOrder < 0)
      return toast.error("Pedido mínimo inválido.");

    if (zoneDraft.mode === "radius") {
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(radius) ||
        Number(radius) <= 0
      )
        return toast.error("Informe centro e raio válidos para a zona.");
    } else {
      try {
        geojson = JSON.parse(zoneDraft.geojson);
      } catch {
        return toast.error("O GeoJSON informado é inválido.");
      }
    }

    setBusy("zone");
    const { error } = await rpc("admin_upsert_delivery_zone", {
      _zone_id: zoneDraft.id,
      _city_id: selectedCityId,
      _name: zoneDraft.name.trim(),
      _center_latitude: latitude,
      _center_longitude: longitude,
      _radius_km: radius,
      _geojson: geojson,
      _delivery_fee: deliveryFee,
      _minimum_order: minimumOrder,
      _is_active: zoneDraft.isActive,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível salvar a zona.");
    toast.success(zoneDraft.id ? "Zona atualizada." : "Zona criada.");
    setZoneDraft(emptyZoneDraft());
    await loadZones();
  };

  const deleteZone = async (zone: DeliveryZone) => {
    if (!window.confirm(`Excluir a zona “${zone.name}”?`)) return;
    setBusy(`delete-zone:${zone.id}`);
    const { error } = await rpc("admin_delete_delivery_zone", { _zone_id: zone.id });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível excluir a zona.");
    toast.success("Zona excluída.");
    if (zoneDraft.id === zone.id) setZoneDraft(emptyZoneDraft());
    await loadZones();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Cidades cadastradas" value={cities.length} />
        <MetricCard label="Cidades ativas" value={cities.filter((city) => city.is_active).length} />
        <MetricCard label="Zonas da cidade" value={zones.length} />
      </div>

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Cidades atendidas</h2>
            <p className="text-xs text-zinc-500">
              Ativação, fuso e raio padrão influenciam a elegibilidade de entrega no servidor.
            </p>
          </div>
          <MapPinned className="h-5 w-5 text-primary" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {cities.map((city) => {
            const editing = editingCity?.id === city.id;
            const row = editing ? editingCity : city;
            return (
              <article
                key={city.id}
                className={`rounded-2xl border p-4 ${selectedCityId === city.id ? "border-primary/30 bg-primary/5" : "border-zinc-900 bg-black"}`}
              >
                {editing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_72px] gap-2">
                      <Input
                        value={row.name}
                        onChange={(value) => setEditingCity({ ...row, name: value })}
                        placeholder="Cidade"
                      />
                      <Input
                        value={row.state}
                        onChange={(value) => setEditingCity({ ...row, state: value.toUpperCase() })}
                        placeholder="UF"
                        maxLength={2}
                      />
                    </div>
                    <Input
                      value={row.timezone || "America/Sao_Paulo"}
                      onChange={(value) => setEditingCity({ ...row, timezone: value })}
                      placeholder="America/Sao_Paulo"
                    />
                    <label className="block text-[10px] font-bold uppercase text-zinc-600">
                      Raio padrão (km)
                      <Input
                        value={String(row.default_delivery_radius_km)}
                        onChange={(value) =>
                          setEditingCity({ ...row, default_delivery_radius_km: value })
                        }
                        placeholder="Raio km"
                        inputMode="decimal"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={row.is_active}
                        onChange={(event) =>
                          setEditingCity({ ...row, is_active: event.target.checked })
                        }
                      />
                      Cidade ativa
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy === `city:${city.id}`}
                        onClick={() => void saveCity(row)}
                        className="flex-1"
                      >
                        {busy === `city:${city.id}` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingCity(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCityId(city.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-black">
                          {city.name} · {city.state}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${city.is_active ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}
                        >
                          {city.is_active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {city.timezone || "America/Sao_Paulo"} · raio padrão {city.default_delivery_radius_km} km
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCity({ ...city })}
                      className="rounded-lg bg-zinc-900 p-2 text-zinc-400"
                      aria-label={`Editar ${city.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <form onSubmit={createCity} className="mt-4 grid gap-2 rounded-2xl border border-dashed border-zinc-800 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Input
            value={newCity.name}
            onChange={(value) => setNewCity({ ...newCity, name: value })}
            placeholder="Nova cidade"
            className="lg:col-span-2"
          />
          <Input
            value={newCity.state}
            onChange={(value) => setNewCity({ ...newCity, state: value.toUpperCase() })}
            placeholder="UF"
            maxLength={2}
          />
          <Input
            value={newCity.timezone}
            onChange={(value) => setNewCity({ ...newCity, timezone: value })}
            placeholder="Fuso"
          />
          <Input
            value={newCity.radius}
            onChange={(value) => setNewCity({ ...newCity, radius: value })}
            placeholder="Raio km"
            inputMode="decimal"
          />
          <Button disabled={busy === "new-city"}>
            {busy === "new-city" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CirclePlus className="mr-2 h-4 w-4" />
            )}
            Adicionar
          </Button>
          <label className="flex items-center gap-2 text-xs text-zinc-500 sm:col-span-2 lg:col-span-6">
            <input
              type="checkbox"
              checked={newCity.active}
              onChange={(event) => setNewCity({ ...newCity, active: event.target.checked })}
            />
            Ativar a cidade imediatamente
          </label>
        </form>
      </section>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form
          onSubmit={saveZone}
          className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-5"
        >
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-primary">
              {zoneDraft.id ? "Editar zona" : "Nova zona"}
            </p>
            <h2 className="mt-1 font-black">{selectedCity?.name || "Selecione uma cidade"}</h2>
          </div>
          <Input
            value={zoneDraft.name}
            onChange={(value) => setZoneDraft({ ...zoneDraft, name: value })}
            placeholder="Nome da zona"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setZoneDraft({ ...zoneDraft, mode: "radius", geojson: "" })}
              className={`rounded-xl border px-3 py-2 text-xs font-black ${zoneDraft.mode === "radius" ? "border-primary bg-primary/5 text-primary" : "border-zinc-800 text-zinc-500"}`}
            >
              Raio
            </button>
            <button
              type="button"
              onClick={() =>
                setZoneDraft({
                  ...zoneDraft,
                  mode: "polygon",
                  centerLatitude: "",
                  centerLongitude: "",
                  radiusKm: "",
                })
              }
              className={`rounded-xl border px-3 py-2 text-xs font-black ${zoneDraft.mode === "polygon" ? "border-primary bg-primary/5 text-primary" : "border-zinc-800 text-zinc-500"}`}
            >
              GeoJSON
            </button>
          </div>
          {zoneDraft.mode === "radius" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={zoneDraft.centerLatitude}
                  onChange={(value) => setZoneDraft({ ...zoneDraft, centerLatitude: value })}
                  placeholder="Latitude centro"
                  inputMode="decimal"
                />
                <Input
                  value={zoneDraft.centerLongitude}
                  onChange={(value) => setZoneDraft({ ...zoneDraft, centerLongitude: value })}
                  placeholder="Longitude centro"
                  inputMode="decimal"
                />
              </div>
              <Input
                value={zoneDraft.radiusKm}
                onChange={(value) => setZoneDraft({ ...zoneDraft, radiusKm: value })}
                placeholder="Raio em km"
                inputMode="decimal"
              />
            </div>
          ) : (
            <textarea
              value={zoneDraft.geojson}
              onChange={(event) => setZoneDraft({ ...zoneDraft, geojson: event.target.value })}
              className="min-h-40 w-full rounded-xl border border-zinc-800 bg-black p-3 font-mono text-xs text-white outline-none focus:border-primary"
              placeholder='{"type":"Polygon","coordinates":[...]}'
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={zoneDraft.deliveryFee}
              onChange={(value) => setZoneDraft({ ...zoneDraft, deliveryFee: value })}
              placeholder="Taxa R$"
              inputMode="decimal"
            />
            <Input
              value={zoneDraft.minimumOrder}
              onChange={(value) => setZoneDraft({ ...zoneDraft, minimumOrder: value })}
              placeholder="Pedido mínimo"
              inputMode="decimal"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={zoneDraft.isActive}
              onChange={(event) => setZoneDraft({ ...zoneDraft, isActive: event.target.checked })}
            />
            Zona ativa
          </label>
          <div className="flex gap-2">
            <Button disabled={!selectedCityId || busy === "zone"} className="flex-1">
              {busy === "zone" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {zoneDraft.id ? "Salvar alterações" : "Criar zona"}
            </Button>
            {zoneDraft.id ? (
              <Button type="button" variant="outline" onClick={() => setZoneDraft(emptyZoneDraft())}>
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </form>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="mb-4">
            <h2 className="font-black">Zonas de entrega</h2>
            <p className="text-xs text-zinc-500">
              Quando uma cidade possui zonas ativas, o checkout exige que o endereço esteja dentro de uma delas.
            </p>
          </div>
          {loadingZones ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando zonas...
            </div>
          ) : zones.length === 0 ? (
            <EmptyState title="Nenhuma zona cadastrada" description="Sem zonas ativas, o servidor usa o raio padrão da cidade quando houver coordenadas do estabelecimento; caso contrário, restringe pela cidade/UF." />
          ) : (
            <div className="space-y-3">
              {zones.map((zone) => (
                <article key={zone.id} className="rounded-2xl border border-zinc-900 bg-black p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-black">{zone.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${zone.is_active ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}>
                          {zone.is_active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {zone.geojson ? "Polígono GeoJSON" : `Raio ${zone.radius_km} km`} · taxa {money(zone.delivery_fee)} · mínimo {money(zone.minimum_order)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => editZone(zone)} className="rounded-lg bg-zinc-900 p-2 text-zinc-400" aria-label={`Editar zona ${zone.name}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" disabled={busy === `delete-zone:${zone.id}`} onClick={() => void deleteZone(zone)} className="rounded-lg bg-red-500/10 p-2 text-red-400 disabled:opacity-50" aria-label={`Excluir zona ${zone.name}`}>
                        {busy === `delete-zone:${zone.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  inputMode,
  maxLength,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      maxLength={maxLength}
      className={`w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-primary ${className}`}
    />
  );
}