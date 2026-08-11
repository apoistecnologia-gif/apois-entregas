from pathlib import Path

path = Path('src/components/CourierRouteMap.tsx')
text = path.read_text(encoding='utf-8')
old_import = 'import { APIProvider, AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";'
new_import = 'import { APIProvider, AdvancedMarker, ColorScheme, Map, useMap } from "@vis.gl/react-google-maps";'
if old_import not in text:
    raise SystemExit('map import target not found')
text = text.replace(old_import, new_import, 1)
needle = '              mapId={mapId}\n            >'
replacement = '              mapId={mapId}\n              colorScheme={ColorScheme.DARK}\n              mapTypeControl={false}\n              streetViewControl={false}\n              fullscreenControl={false}\n            >'
count = text.count(needle)
if count < 2:
    raise SystemExit(f'expected at least two map targets, found {count}')
text = text.replace(needle, replacement)
path.write_text(text, encoding='utf-8')
