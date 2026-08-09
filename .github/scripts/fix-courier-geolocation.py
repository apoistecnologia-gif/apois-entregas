from pathlib import Path

path = Path("src/routes/courier.tsx")
text = path.read_text(encoding="utf-8")
old = '''  const toggleOnline = async () => {
    if (!courier?.id) return;
    const target = !availability?.is_online;
    if (target && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
          }),
        );
        setBusy("online");
        const { error } = await rpc("set_courier_online", { _is_online: true });
        if (error) throw error;
        setCurrentPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          heading:
            position.coords.heading !== null && Number.isFinite(position.coords.heading)
              ? position.coords.heading
              : null,
          speed:
            position.coords.speed !== null && Number.isFinite(position.coords.speed)
              ? position.coords.speed
              : null,
          recordedAt: Date.now(),
        });
      } catch (error: any) {
        setBusy(null);
        return toast.error(error?.message || "Ative a localização para ficar online.");
      }
    } else {
      setBusy("online");
      const { error } = await rpc("set_courier_online", { _is_online: false });
      if (error) {
        setBusy(null);
        return toast.error(error.message);
      }
      setCurrentPosition(null);
    }
    setBusy(null);
    await loadCourierOperations(courier.id);
  };'''
new = '''  const toggleOnline = async () => {
    if (!courier?.id) return;
    const target = !availability?.is_online;

    if (target) {
      if (!navigator.geolocation) {
        toast.error("Este dispositivo não disponibiliza localização. Ative o GPS para ficar online.");
        return;
      }
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
          }),
        );
        setBusy("online");
        const { error } = await rpc("set_courier_online", { _is_online: true });
        if (error) throw error;
        setCurrentPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          heading:
            position.coords.heading !== null && Number.isFinite(position.coords.heading)
              ? position.coords.heading
              : null,
          speed:
            position.coords.speed !== null && Number.isFinite(position.coords.speed)
              ? position.coords.speed
              : null,
          recordedAt: Date.now(),
        });
      } catch (error: any) {
        setBusy(null);
        return toast.error(error?.message || "Ative a localização para ficar online.");
      }
    } else {
      setBusy("online");
      const { error } = await rpc("set_courier_online", { _is_online: false });
      if (error) {
        setBusy(null);
        return toast.error(error.message);
      }
      setCurrentPosition(null);
    }
    setBusy(null);
    await loadCourierOperations(courier.id);
  };'''
if old not in text:
    raise SystemExit("toggleOnline anchor not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
