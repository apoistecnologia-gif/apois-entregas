from pathlib import Path

path = Path("src/routes/merchant.tsx")
text = path.read_text()

text = text.replace(
'''    if (!settingsDraft.name.trim() || !settingsDraft.addressLine.trim()) {
      toast.error("Informe o nome e o endereço do estabelecimento.");
      return;
    }
''',
'''    if (!settingsDraft.name.trim()) {
      toast.error("Informe o nome do estabelecimento.");
      return;
    }
''',
1,
)

text = text.replace(
'''        contact_email: settingsDraft.contactEmail.trim() || null,
        address_line: settingsDraft.addressLine.trim(),
        neighborhood: settingsDraft.neighborhood.trim() || null,
        delivery_fee: deliveryFee,
''',
'''        contact_email: settingsDraft.contactEmail.trim() || null,
        delivery_fee: deliveryFee,
''',
1,
)

text = text.replace(
'''            <Field
              value={settingsDraft.addressLine}
              onChange={(value) => setSettingsDraft((d) => ({ ...d, addressLine: value }))}
              placeholder="Endereço"
              required
            />
            <Field
              value={settingsDraft.neighborhood}
              onChange={(value) => setSettingsDraft((d) => ({ ...d, neighborhood: value }))}
              placeholder="Bairro"
            />
            <p className="text-xs text-zinc-500">
              Cidade operacional:{" "}
              <strong className="text-zinc-300">
                {merchant.city} - {merchant.state}
              </strong>
              . A troca de cidade é controlada pelo administrador para preservar zonas e taxas.
            </p>
''',
'''            <div className="rounded-xl border border-zinc-800 bg-black p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                Endereço físico
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-200">
                {[merchant.address_line, merchant.neighborhood, `${merchant.city} - ${merchant.state}`]
                  .filter(Boolean)
                  .join(" · ") || "Ainda não confirmado"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                O endereço físico não pode ser digitado aqui. Para alterá-lo, use a seção
                “Localização da loja” e confirme explicitamente o ponto no mapa. Endereço, cidade e
                coordenadas são gravados juntos para impedir divergências operacionais.
              </p>
            </div>
''',
1,
)

path.write_text(text)
