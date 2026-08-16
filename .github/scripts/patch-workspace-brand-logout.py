from pathlib import Path

p = Path('src/components/WorkspaceShell.tsx')
s = p.read_text()

asset_import = 'import logoAsset from "@/assets/logo.png.asset.json";\n'
if asset_import not in s:
    s = s.replace('import { supabase } from "@/integrations/supabase/client";\n', 'import { supabase } from "@/integrations/supabase/client";\n' + asset_import)

old_desktop = '''          <div className="border-b border-zinc-900 p-6">
            <p className="text-2xl font-black tracking-tight text-primary">APOIS</p>
            <p className="mt-1 text-sm font-bold text-white">{brand}</p>
            <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
          </div>'''
new_desktop = '''          <div className="border-b border-zinc-900 p-6">
            <div className="flex items-center gap-3">
              <img src={logoAsset.url} alt="APOIS" className="h-11 w-11 rounded-xl object-contain" />
              <div className="min-w-0">
                <p className="text-lg font-black tracking-tight text-primary">APOIS</p>
                <p className="truncate text-sm font-bold text-white">{brand}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{subtitle}</p>
          </div>'''
s = s.replace(old_desktop, new_desktop)

old_mobile = '''            <div>
              <p className="text-xl font-black text-primary">APOIS</p>
              <p className="text-sm font-bold">{brand}</p>
            </div>'''
new_mobile = '''            <div className="flex items-center gap-3">
              <img src={logoAsset.url} alt="APOIS" className="h-10 w-10 rounded-xl object-contain" />
              <div>
                <p className="text-lg font-black text-primary">APOIS</p>
                <p className="text-sm font-bold">{brand}</p>
              </div>
            </div>'''
s = s.replace(old_mobile, new_mobile)

old_header_right = '''            {userLabel ? (
              <span className="hidden max-w-xs truncate text-xs text-zinc-500 sm:block">
                {userLabel}
              </span>
            ) : null}'''
new_header_right = '''            <div className="flex items-center gap-2">
              {userLabel ? (
                <span className="hidden max-w-xs truncate text-xs text-zinc-500 sm:block">
                  {userLabel}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-400 transition hover:bg-red-500/20"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>'''
s = s.replace(old_header_right, new_header_right)

p.write_text(s)
