from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Admin coverage: memoize zone loader so city changes cannot run a stale closure.
path = Path("src/components/AdminCoveragePanel.tsx")
replace_once(path, 'import { useEffect, useMemo, useState } from "react";', 'import { useCallback, useEffect, useMemo, useState } from "react";', "coverage import")
replace_once(path, '  const loadZones = async () => {', '  const loadZones = useCallback(async () => {', "coverage callback start")
replace_once(
    path,
    '  };\n\n  useEffect(() => {\n    void loadZones();\n  }, [selectedCityId]);',
    '  }, [selectedCityId]);\n\n  useEffect(() => {\n    void loadZones();\n  }, [loadZones]);',
    "coverage callback end",
)

# Courier map: depend on the memoized target object instead of decomposed properties.
path = Path("src/components/CourierRouteMap.tsx")
replace_once(path, '  }, [currentPosition, map, target.lat, target.lng]);', '  }, [currentPosition, map, target]);', "courier map target dependency")

# Merchant coupons: memoize server loader.
path = Path("src/components/MerchantCouponsPanel.tsx")
replace_once(path, 'import { useEffect, useMemo, useState } from "react";', 'import { useCallback, useEffect, useMemo, useState } from "react";', "coupon import")
replace_once(path, '  const load = async () => {', '  const load = useCallback(async () => {', "coupon callback start")
replace_once(
    path,
    '  };\n\n  useEffect(() => {\n    void load();\n  }, [merchantId]);',
    '  }, [merchantId]);\n\n  useEffect(() => {\n    void load();\n  }, [load]);',
    "coupon callback end",
)

# Merchant promotions: memoize loader for the same reason.
path = Path("src/components/MerchantGrowthPanels.tsx")
replace_once(path, 'import { useEffect, useMemo, useState } from "react";', 'import { useCallback, useEffect, useMemo, useState } from "react";', "growth import")
replace_once(path, '  const loadPromotions = async () => {', '  const loadPromotions = useCallback(async () => {', "promotion callback start")
replace_once(
    path,
    '  };\n\n  useEffect(() => {\n    void loadPromotions();\n  }, [merchantId]);',
    '  }, [merchantId]);\n\n  useEffect(() => {\n    void loadPromotions();\n  }, [loadPromotions]);',
    "promotion callback end",
)

# Product editor: keep option loader synchronized with the active product.
path = Path("src/components/MerchantProductEditor.tsx")
replace_once(path, 'import { useEffect, useMemo, useState } from "react";', 'import { useCallback, useEffect, useMemo, useState } from "react";', "product import")
replace_once(path, '  const loadOptions = async () => {', '  const loadOptions = useCallback(async () => {', "product callback start")
replace_once(
    path,
    '  };\n\n  useEffect(() => {\n    if (open) void loadOptions();\n  }, [open, product.id]);',
    '  }, [product.id]);\n\n  useEffect(() => {\n    if (open) void loadOptions();\n  }, [open, loadOptions]);',
    "product callback end",
)

# Search: separate catalog loading from focus behavior and remove duplicate stale-state reset.
path = Path("src/routes/buscar.tsx")
replace_once(path, 'import { useEffect, useState, useRef } from "react";', 'import { useCallback, useEffect, useState, useRef } from "react";', "search import")
replace_once(path, '  const fetchData = async () => {', '  const fetchData = useCallback(async () => {', "search callback start")
replace_once(
    path,
    '  };\n\n  useEffect(() => {\n    fetchData();\n    if (searchInputRef.current && !searchParams.categoria && !searchParams.q) {\n      searchInputRef.current.focus();\n    }\n  }, []);',
    '  }, []);\n\n  useEffect(() => {\n    void fetchData();\n  }, [fetchData]);\n\n  useEffect(() => {\n    if (searchInputRef.current && !searchParams.categoria && !searchParams.q) {\n      searchInputRef.current.focus();\n    }\n  }, [searchParams.categoria, searchParams.q]);',
    "search effects",
)
replace_once(
    path,
    '            setMerchantsSpecialHours([]);\n            setMerchantsSpecialHours([]);',
    '            setMerchantsSpecialHours([]);',
    "search duplicate reset",
)
replace_once(
    path,
    '        } else {\n          setMerchants([]);\n          setMerchantsHours([]);\n        }',
    '        } else {\n          setMerchants([]);\n          setMerchantsHours([]);\n          setMerchantsSpecialHours([]);\n        }',
    "search missing special-hours reset",
)
