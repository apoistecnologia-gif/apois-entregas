from pathlib import Path

path = Path("src/routes/courier.tsx")
text = path.read_text(encoding="utf-8")

old = '''        const { error } = await rpc("set_courier_online", { _is_online: true });
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
        });'''

new = '''        const { error } = await rpc("set_courier_online", { _is_online: true });
        if (error) throw error;

        const initialPosition: CourierPosition = {
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
        };
        const { error: locationError } = await rpc("update_courier_location", {
          _latitude: initialPosition.lat,
          _longitude: initialPosition.lng,
          _accuracy_meters: initialPosition.accuracy,
          _heading: initialPosition.heading,
          _speed_mps: initialPosition.speed,
        });
        if (locationError) {
          await rpc("set_courier_online", { _is_online: false });
          throw locationError;
        }
        setCurrentPosition(initialPosition);'''

if text.count(old) != 1:
    raise SystemExit(f"expected exactly one online location block, found {text.count(old)}")

text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
