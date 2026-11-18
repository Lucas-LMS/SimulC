import { useMemo, useState } from "react";
import { ArrowRight, Check, Edit3, Eye, EyeOff, MapPin, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceData } from "../lib/models";
import type { PortfolioUnit } from "../data/portfolio";
import { formatBRL, formatNumber } from "../lib/money";
import { minimumActForPrice } from "../lib/calculator";
import { compareTableDates } from "../lib/catalogVersion";
import { createId } from "../lib/storage";
import { CATALOG_REGIONS, NO_DELIVERY_YEAR, classifyRegion, filterCatalog, presentDeliveryYears, presentTypologyClasses, type CatalogRegion, type TypologyClass } from "../lib/catalogFilters";
import CurrencyInput from "./CurrencyInput";

const LEGACY_REGIONS: PortfolioUnit["region"][] = ["Zona Norte", "Niterói", "Porto/Centro", "Sudoeste/Oeste"];
const newUnit = (): PortfolioUnit => ({
  id: createId("unit"), project: "", neighborhood: "", region: "Zona Norte", typology: "", parking: "unknown",
  deliveryText: "Entrega a confirmar", source: "Cadastro manual", sourceDate: new Date().toISOString().slice(0, 10), active: true,
  internalNote: "Cadastro manual — confirme no espelho vigente.",
});
const unitPrice = (unit: PortfolioUnit) => unit.priceCents ?? unit.priceLowCents ?? null;
const priceLabel = (unit: PortfolioUnit) => unit.priceCents !== undefined
  ? formatBRL(unit.priceCents)
  : unit.priceLowCents !== undefined && unit.priceHighCents !== undefined
    ? `${formatBRL(unit.priceLowCents)} – ${formatBRL(unit.priceHighCents)}`
    : "Preço a informar";
const deliveryLabel = (unit: PortfolioUnit) => {
  if (!unit.deliveryMonth || !unit.deliveryYear) return unit.deliveryText;
  const date = `${String(unit.deliveryMonth).padStart(2, "0")}/${unit.deliveryYear}`;
  const origin = unit.deliveryDateSource === "simulation" ? " · informado no simulador; confirmar" : unit.deliveryDateSource === "manual" ? " · informado manualmente; confirmar" : "";
  const original = unit.deliveryDateSource && unit.deliveryText ? ` · texto original: ${unit.deliveryText}` : "";
  return `${date}${origin}${original}`;
};

interface Props {
  workspace: WorkspaceData;
  setWorkspace: Dispatch<SetStateAction<WorkspaceData>>;
  onSimulate: (propertyId: string) => void;
}

export default function CatalogPage({ workspace, setWorkspace, onSimulate }: Props) {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<CatalogRegion | "">("");
  const [projectFilter, setProjectFilter] = useState("");
  const [yearFilter, setYearFilter] = useState<number | typeof NO_DELIVERY_YEAR | "">("");
  const [typologyFilter, setTypologyFilter] = useState<TypologyClass | "">("");
  const [editing, setEditing] = useState<PortfolioUnit | null>(null);
  const [notice, setNotice] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const catalog = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return filterCatalog(workspace.portfolio, {
      project: projectFilter,
      year: yearFilter || undefined,
      typology: typologyFilter || undefined,
      region: region || undefined,
    }).filter((unit) => {
      const matchesQuery = !query || `${unit.project} ${unit.neighborhood} ${unit.typology} ${unit.deliveryText}`.toLocaleLowerCase("pt-BR").includes(query);
      return matchesQuery && (showInactive || unit.active !== false);
    }).sort((a, b) => a.project.localeCompare(b.project, "pt-BR") || (unitPrice(a) ?? Infinity) - (unitPrice(b) ?? Infinity));
  }, [workspace.portfolio, search, projectFilter, yearFilter, typologyFilter, region, showInactive]);
  const deliveryYearOptions = useMemo(() => presentDeliveryYears(workspace.portfolio), [workspace.portfolio]);
  const typologyOptions = useMemo(() => presentTypologyClasses(workspace.portfolio), [workspace.portfolio]);
  const compared = compareIds.map((id) => workspace.portfolio.find((unit) => unit.id === id)).filter((unit): unit is PortfolioUnit => Boolean(unit));

  const save = (unit: PortfolioUnit) => {
    if (!unit.project.trim() || !unit.typology.trim()) return;
    const previous = workspace.portfolio.find((item) => item.id === unit.id);
    const previousHasPrice = previous?.priceCents !== undefined || previous?.priceLowCents !== undefined;
    const priceChanged = previous && (previous.priceCents !== unit.priceCents || previous.priceLowCents !== unit.priceLowCents || previous.priceHighCents !== unit.priceHighCents);
    const tableChanged = previous && (previous.sourceDate !== unit.sourceDate || previous.source !== unit.source);
    if (previous && previousHasPrice && (priceChanged || tableChanged)) {
      if (compareTableDates(previous.sourceDate, unit.sourceDate) !== "newer") {
        setNotice("Preço e origem atuais foram preservados: uma tabela igual/mais antiga não substitui a versão vigente. Informe a data real mais nova ou cadastre uma variação separada.");
        return;
      }
      const newVersionId = createId("unit");
      const versionGroupId = previous.versionGroupId ?? createId("catalog-version");
      if (!window.confirm(`Nova versão manual de ${unit.project} — ${unit.typology}?\n\nAnterior: ${previous.sourceDate} · ${previous.source} · ${priceLabel(previous)}\nNova: ${unit.sourceDate} · ${unit.source} · ${priceLabel(unit)}\n\nA anterior será inativada e preservada no histórico.`)) return;
      const nextVersion = { ...unit, id: newVersionId, active: true, versionGroupId };
      setWorkspace((current) => ({ ...current, portfolio: [nextVersion, ...current.portfolio.map((item) => item.id === previous.id ? { ...item, active: false, versionGroupId, replacedById: nextVersion.id } : item)] }));
      setNotice(`Nova versão ativada; ${previous.sourceDate} foi preservada como inativa.`);
      setEditing(null);
      return;
    }
    setWorkspace((current) => ({ ...current, portfolio: current.portfolio.some((item) => item.id === unit.id) ? current.portfolio.map((item) => item.id === unit.id ? unit : item) : [unit, ...current.portfolio] }));
    setNotice("Unidade atualizada no catálogo local.");
    setEditing(null);
  };
  const remove = (unit: PortfolioUnit) => {
    if (!window.confirm(`Remover ${unit.project} — ${unit.typology} do catálogo? Simulações já salvas não serão apagadas.`)) return;
    setWorkspace((current) => ({ ...current, portfolio: current.portfolio.filter((item) => item.id !== unit.id) }));
    setNotice("Unidade removida do catálogo local.");
    setEditing(null);
  };
  const toggleActive = (unit: PortfolioUnit) => {
    const activating = unit.active === false;
    const activeSiblings = activating && unit.versionGroupId ? workspace.portfolio.filter((item) => item.versionGroupId === unit.versionGroupId && item.id !== unit.id && item.active !== false) : [];
    if (activeSiblings.length && !window.confirm(`Já existe uma versão ativa (${activeSiblings.map((item) => `${item.sourceDate} · ${item.source}`).join(", ")}). Reativar esta versão e inativar a(s) ativa(s) do mesmo histórico?`)) return;
    setWorkspace((current) => ({ ...current, portfolio: current.portfolio.map((item) => {
      if (item.id === unit.id) return { ...item, active: activating };
      if (activating && unit.versionGroupId && item.versionGroupId === unit.versionGroupId && activeSiblings.some((sibling) => sibling.id === item.id)) return { ...item, active: false, replacedById: unit.id };
      return item;
    }) }));
    setNotice(activating ? "Versão histórica reativada após confirmação; outra versão do grupo foi inativada." : "Unidade inativada manualmente.");
  };
  const toggleCompare = (unit: PortfolioUnit) => setCompareIds((current) => current.includes(unit.id) ? current.filter((id) => id !== unit.id) : current.length >= 5 ? current : [...current, unit.id]);

  return (
    <div className="page-stack catalog-page">
      <div className="page-heading page-heading-row"><div><div className="eyebrow">UNIDADES E TABELAS</div><h1>Catálogo de empreendimentos</h1><p>Pesquise ou atualize as unidades. Você pode cadastrar manualmente sem importar arquivo; a referência inicial não veio de consulta ao vivo.</p></div><button className="button button-primary" onClick={() => { setEditing(newUnit()); setNotice(""); }}><Plus size={16} /> Cadastrar unidade manualmente</button></div>
      <div className="catalog-caveat"><span className="caveat-stamp">NOV/26</span><div><strong>Base de referência — confirme antes de apresentar.</strong><p>Valores, campanhas e entregas foram transcritos do prompt recebido (16/11/2026). Verifique a unidade, o espelho vigente e o cronograma oficial; disponibilidade não é consultada pelo site.</p></div></div>
      <div className="catalog-toolbar panel"><div className="search-field catalog-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Empreendimento, bairro ou planta" /></div><label className="filter-select"><SlidersHorizontal size={15} /><select aria-label="Filtrar por empreendimento" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">Todos os empreendimentos</option>{[...new Set(workspace.portfolio.map((unit) => unit.project))].sort((a, b) => a.localeCompare(b, "pt-BR")).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="filter-select"><select aria-label="Filtrar por ano de entrega" value={yearFilter} onChange={(event) => setYearFilter(event.target.value === NO_DELIVERY_YEAR ? NO_DELIVERY_YEAR : event.target.value ? Number(event.target.value) : "")}><option value="">Todos os anos</option>{deliveryYearOptions.map((value) => <option key={value} value={value}>{value === NO_DELIVERY_YEAR ? "Sem ano" : value}</option>)}</select></label><label className="filter-select"><select aria-label="Filtrar por tipologia" value={typologyFilter} onChange={(event) => setTypologyFilter(event.target.value as TypologyClass | "")}><option value="">Todas as tipologias</option>{typologyOptions.map((value) => <option key={value}>{value}</option>)}</select></label><label className="filter-select"><select aria-label="Filtrar por região" value={region} onChange={(event) => setRegion(event.target.value as CatalogRegion | "")}><option value="">Todas as regiões</option>{CATALOG_REGIONS.map((value) => <option key={value}>{value}</option>)}</select></label><label className="check-field compact-check"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /><span>Inativas</span></label><span className="result-count">{catalog.length} unidades</span><span className="compare-count">{compareIds.length}/5 comparar</span></div>
      {compared.length > 0 && <section className="panel compare-panel"><div className="section-heading"><div><span className="eyebrow">COMPARAÇÃO RÁPIDA</span><h2>{compared.length} {compared.length === 1 ? "unidade selecionada" : "unidades selecionadas"}</h2></div><button className="text-button" onClick={() => setCompareIds([])}>Limpar</button></div><div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>Empreendimento / variante</th><th>Região · bairro</th><th>Vaga · área</th><th>Preço de referência</th><th>Ato mínimo · 2,5%</th><th>Entrega</th><th>PRICE / pós-chaves</th><th></th></tr></thead><tbody>{compared.map((unit) => <tr key={unit.id}><td><strong>{unit.project}</strong><small>{unit.typology}</small></td><td>{classifyRegion(unit)}<small>{unit.neighborhood || "Bairro não informado"}</small></td><td>{unit.parking === true ? "Com vaga" : unit.parking === false ? "Sem vaga" : "A confirmar"}<small>{unit.areaText || (unit.areaM2 ? `${formatNumber(unit.areaM2, 0)} m²` : "Área não informada")}</small></td><td>{priceLabel(unit)}<small>{unit.sourceDate} · confirmar vigente</small></td><td>{unitPrice(unit) !== null ? formatBRL(minimumActForPrice(unitPrice(unit)!)) : "A informar"}</td><td>{unit.deliveryMonth && unit.deliveryYear ? `${String(unit.deliveryMonth).padStart(2, "0")}/${unit.deliveryYear}` : unit.deliveryText}<small>{unit.deliveryDateSource === "simulation" ? "Informada no simulador; confirmar" : unit.deliveryDateSource === "manual" ? "Informada manualmente; confirmar" : unit.deliveryMonth ? "Referência; confirmar" : "[A CONFIRMAR]"}</small></td><td>Requer PRICE/GPM por unidade<small>Pós-chaves sem condição presumida</small></td><td><button className="button button-quiet button-small" onClick={() => onSimulate(unit.id)}>Simular</button><button className="icon-button" title="Remover da comparação" onClick={() => toggleCompare(unit)}><X size={14} /></button></td></tr>)}</tbody></table></div><p className="small-note">Comparação de cadastro e preço. Financiamento, mensais, anuais e pós-chaves só são calculados com condições informadas para cada unidade.</p></section>}
      <div className="catalog-layout">
        <section className="catalog-list" aria-label="Unidades cadastradas">
          {catalog.length ? catalog.map((unit) => <article className={`catalog-card panel ${unit.active === false ? "inactive" : ""}`} key={unit.id}>
            <div className="catalog-card-main"><div className="catalog-project-line"><span className="catalog-region-dot" /><span>{classifyRegion(unit)}</span><span className="source-pill">{unit.source.startsWith("Prompt") ? "BASE NOV/26" : unit.source.toLocaleLowerCase("pt-BR").includes("manual") ? "MANUAL" : "ARQUIVO"}</span>{unit.active === false && <span className="source-pill inactive-pill">INATIVA</span>}</div><h3>{unit.project}</h3><div className="catalog-unit-line">{unit.typology}{unit.areaText ? ` · ${unit.areaText}` : unit.areaM2 ? ` · ${unit.areaM2} m²` : ""}</div><div className="catalog-meta"><span><MapPin size={13} />{unit.neighborhood || "Bairro não informado"}</span><span>{deliveryLabel(unit)}</span><span>{unit.parking === true ? "Com vaga" : unit.parking === false ? "Sem vaga" : "Vaga a confirmar"}</span></div><p className="catalog-note">Fonte: {unit.source} · Data da tabela: {unit.sourceDate}{unit.versionGroupId ? " · versão vinculada" : ""}</p>{unit.internalNote && <p className="catalog-note">{unit.internalNote}</p>}</div>
            <div className="catalog-price-block"><small>PREÇO DE REFERÊNCIA</small><strong>{priceLabel(unit)}</strong><span>{unit.sourceDate} · {unit.source}</span><div className="catalog-actions"><label className="compare-check"><input type="checkbox" checked={compareIds.includes(unit.id)} disabled={!compareIds.includes(unit.id) && compareIds.length >= 5} onChange={() => toggleCompare(unit)} /><span>Comparar</span></label><button className="icon-button" aria-label="Editar unidade" onClick={() => setEditing(unit)}><Edit3 size={15} /></button><button className="button button-quiet button-small" disabled={unit.active === false} onClick={() => onSimulate(unit.id)}>Simular <ArrowRight size={13} /></button><button className="icon-button" title={unit.active === false ? "Reativar unidade" : "Desativar unidade"} aria-label={unit.active === false ? "Reativar unidade" : "Desativar unidade"} onClick={() => toggleActive(unit)}>{unit.active === false ? <Eye size={15} /> : <EyeOff size={15} />}</button></div></div>
          </article>) : <div className="panel catalog-empty"><Search size={20} /><p>Nenhuma unidade encontrada com esses filtros.</p></div>}
        </section>
        {editing && <UnitEditor key={editing.id} unit={editing} onCancel={() => setEditing(null)} onSave={save} onDelete={workspace.portfolio.some((unit) => unit.id === editing.id) ? remove : undefined} />}
      </div>
      {notice && <div className="inline-status"><Check size={14} />{notice}</div>}
    </div>
  );
}

function UnitEditor({ unit, onCancel, onSave, onDelete }: { unit: PortfolioUnit; onCancel: () => void; onSave: (unit: PortfolioUnit) => void; onDelete?: (unit: PortfolioUnit) => void }) {
  const [form, setForm] = useState<PortfolioUnit>(unit);
  const update = (patch: Partial<PortfolioUnit>) => setForm((current) => ({ ...current, ...patch }));
  return (
    <aside className="panel unit-editor">
      <div className="section-heading"><div><span className="eyebrow">{onDelete ? "EDITAR CATÁLOGO" : "NOVA UNIDADE"}</span><h2>Dados da unidade</h2></div><button className="icon-button" aria-label="Fechar" onClick={onCancel}><X size={17} /></button></div>
      <div className="form-grid">
        <label className="form-field span-2"><span>Empreendimento *</span><input value={form.project} onChange={(e) => update({ project: e.target.value })} placeholder="Nome do empreendimento" /></label>
        <label className="form-field"><span>Bairro</span><input value={form.neighborhood} onChange={(e) => update({ neighborhood: e.target.value })} placeholder="Bairro" /></label>
        <label className="form-field"><span>Região</span><select value={form.region} onChange={(e) => update({ region: e.target.value as PortfolioUnit["region"] })}>{[...CATALOG_REGIONS, ...(LEGACY_REGIONS.includes(form.region) ? [form.region] : [])].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="form-field span-2"><span>Tipologia / variante *</span><input value={form.typology} onChange={(e) => update({ typology: e.target.value })} placeholder="Ex.: 2Q com vaga" /></label>
        <label className="form-field"><span>Quartos (se conhecido)</span><input type="number" min="0" max="10" value={form.bedrooms ?? ""} onChange={(e) => update({ bedrooms: e.target.value ? Number(e.target.value) : undefined })} placeholder="—" /></label>
        <label className="form-field"><span>Vaga</span><select value={form.parking === "unknown" ? "unknown" : form.parking ? "yes" : "no"} onChange={(e) => update({ parking: e.target.value === "unknown" ? "unknown" : e.target.value === "yes" })}><option value="unknown">A confirmar</option><option value="yes">Com vaga</option><option value="no">Sem vaga</option></select></label>
        <label className="form-field"><span>Área (m²)</span><div className="unit-control"><input type="number" min="0" step="0.1" value={form.areaM2 ?? ""} onChange={(e) => update({ areaM2: e.target.value ? Number(e.target.value) : undefined })} placeholder="—" /><span>m²</span></div></label>
        <label className="form-field"><span>Preço único</span><div className="money-control"><span>R$</span><CurrencyInput value={form.priceCents ?? null} onChange={(value) => update({ priceCents: value ?? undefined, priceLowCents: undefined, priceHighCents: undefined })} min="0" placeholder="0,00" /></div></label>
        <label className="form-field"><span>Ou preço mínimo da faixa</span><div className="money-control"><span>R$</span><CurrencyInput value={form.priceLowCents ?? null} onChange={(value) => update({ priceLowCents: value ?? undefined, priceCents: undefined })} min="0" placeholder="0,00" /></div></label>
        <label className="form-field"><span>Preço máximo da faixa</span><div className="money-control"><span>R$</span><CurrencyInput value={form.priceHighCents ?? null} onChange={(value) => update({ priceHighCents: value ?? undefined })} min="0" placeholder="0,00" /></div></label>
        <label className="form-field"><span>Mês de entrega</span><select value={form.deliveryMonth ?? ""} onChange={(e) => update({ deliveryMonth: e.target.value ? Number(e.target.value) : undefined, deliveryDateSource: e.target.value ? "manual" : undefined })}><option value="">Não informado</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, i, 1))}</option>)}</select></label>
        <label className="form-field"><span>Ano de entrega</span><input type="number" min="2026" max="2040" value={form.deliveryYear ?? ""} onChange={(e) => update({ deliveryYear: e.target.value ? Number(e.target.value) : undefined, deliveryDateSource: e.target.value ? "manual" : undefined })} placeholder="—" /></label>
        <label className="form-field span-2"><span>Texto de entrega / condições</span><input value={form.deliveryText} onChange={(e) => update({ deliveryText: e.target.value })} placeholder="Entrega 2028; pronto para morar; confirmar mês..." /></label>
        <label className="form-field"><span>Fonte / campanha</span><input value={form.source} onChange={(e) => update({ source: e.target.value })} /></label>
        <label className="form-field"><span>Data da tabela</span><input type="date" value={form.sourceDate} onChange={(e) => update({ sourceDate: e.target.value })} /></label>
        <label className="form-field span-2"><span>Notas internas / pendências</span><textarea rows={3} value={form.internalNote ?? ""} onChange={(e) => update({ internalNote: e.target.value })} /></label>
      </div>
      <div className="form-footer"><button className="button button-quiet" onClick={onCancel}>Cancelar</button><div className="form-actions">{onDelete && <button className="text-button danger-text" onClick={() => onDelete(unit)}>Excluir unidade</button>}<button className="button button-primary" disabled={!form.project.trim() || !form.typology.trim()} onClick={() => onSave(form)}><Check size={15} /> Salvar unidade</button></div></div>
    </aside>
  );
}
