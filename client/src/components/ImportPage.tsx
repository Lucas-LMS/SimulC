import { useRef, useState } from "react";
import { AlertCircle, ArrowDownToLine, Check, FileImage, FileText, Info, LoaderCircle, Plus, ScanText, Trash2, Upload, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { ImportedDocument, WorkspaceData } from "../lib/models";
import type { PortfolioUnit } from "../data/portfolio";
import { parseTableFile, type ImportProgress } from "../lib/importFiles";
import { deleteOriginalFile, getOriginalFile, saveOriginalFile } from "../lib/fileStore";
import { compareTableDates, findCatalogVersionMatches, normalizeCatalogTypology } from "../lib/catalogVersion";
import { formatBRL } from "../lib/money";
import { createId } from "../lib/storage";
import { CATALOG_REGIONS } from "../lib/catalogFilters";
import CurrencyInput from "./CurrencyInput";

const REGIONS: PortfolioUnit["region"][] = [...CATALOG_REGIONS];

interface Props {
  workspace: WorkspaceData;
  setWorkspace: Dispatch<SetStateAction<WorkspaceData>>;
}

const bytesLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
const dateLabel = (value: string) => {
  try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value)); }
  catch { return value; }
};

export default function ImportPage({ workspace, setWorkspace }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [versionSelections, setVersionSelections] = useState<Record<string, string>>({});
  const selected = workspace.documents.find((item) => item.id === selectedId) ?? workspace.documents[0] ?? null;

  const saveDocument = (document: ImportedDocument) => {
    setWorkspace((current) => ({ ...current, documents: current.documents.some((item) => item.id === document.id) ? current.documents.map((item) => item.id === document.id ? document : item) : [document, ...current.documents] }));
  };
  const addFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(""); setNotice(""); setProgress({ stage: "reading", progress: 0, detail: "Preparando arquivo no navegador." });
    try {
      const parsed = await parseTableFile(file, true, setProgress);
      const record: ImportedDocument = {
        id: parsed.id, name: parsed.name, mimeType: parsed.mimeType, sizeBytes: parsed.sizeBytes,
        importedAt: parsed.importedAt, tableDate: "", source: parsed.source,
        rawText: parsed.rawText, note: parsed.note, status: "draft", candidatePrices: parsed.candidatePrices,
        pagesProcessed: parsed.pagesProcessed, pagesTotal: parsed.pagesTotal,
      };
      await saveOriginalFile(record.id, file);
      saveDocument(record);
      setSelectedId(record.id);
      setNotice(parsed.rawText ? `${parsed.candidatePrices.length} valor(es) candidato(s) detectado(s). Revise contra o arquivo antes de cadastrar.` : "Arquivo recebido, mas não foi possível extrair texto. Faça cadastro manual ou tente uma imagem mais nítida.");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const patchDocument = (id: string, patch: Partial<ImportedDocument>) => {
    const current = workspace.documents.find((item) => item.id === id);
    if (current) saveDocument({ ...current, ...patch });
  };
  const patchCandidate = (doc: ImportedDocument, index: number, patch: Partial<ImportedDocument["candidatePrices"][number]>) => {
    const rows = doc.candidatePrices.map((candidate, rowIndex) => rowIndex === index ? { ...candidate, ...(Object.hasOwn(patch, "confirmed") ? {} : { confirmed: false }), ...patch } : candidate);
    saveDocument({ ...doc, candidatePrices: rows, status: "draft" });
  };
  const addCandidateToCatalog = (doc: ImportedDocument, index: number, mode: "new" | "supersede", supersedeId?: string) => {
    if (!doc.tableDate) { setNotice("Confirme a data real da tabela/campanha no documento antes de cadastrar no catálogo."); return; }
    const candidate = doc.candidatePrices[index];
    if (!candidate?.confirmed || !candidate.project?.trim() || !candidate.typology?.trim() || candidate.priceCents === null) return;
    const versions = findCatalogVersionMatches(workspace.portfolio, candidate);
    const exact = versions.find((unit) => normalizeCatalogTypology(unit.typology) === normalizeCatalogTypology(candidate.typology ?? ""));
    const activeExact = versions.find((unit) => normalizeCatalogTypology(unit.typology) === normalizeCatalogTypology(candidate.typology ?? "") && unit.active !== false);
    const currentExact = activeExact ?? exact;
    const previous = mode === "supersede" ? versions.find((unit) => unit.id === supersedeId) : undefined;
    if (mode === "supersede" && !previous) { setNotice("Selecione explicitamente uma versão anterior para substituir."); return; }
    if (mode === "new" && activeExact && compareTableDates(activeExact.sourceDate ?? "", doc.tableDate) === "newer") {
      setNotice("Já existe uma versão ativa desta mesma variante. Use ‘Confirmar atualização e inativar anterior’ para não criar uma duplicata ativa."); return;
    }
    if (previous && compareTableDates(previous.sourceDate, doc.tableDate) !== "newer") {
      setNotice("A data desta tabela não é posterior à versão selecionada. A versão ativa foi preservada; registre como variação separada se realmente for outra unidade.");
      return;
    }
    if (previous && !window.confirm(`Confirme a nova versão de ${candidate.project} — ${candidate.typology}.\n\nAnterior: ${previous.sourceDate} · ${previous.source} · ${formatBRL(previous.priceCents ?? previous.priceLowCents ?? null)}\nNova: ${doc.tableDate} · ${doc.name} · ${formatBRL(candidate.priceCents)}\n\nA anterior ficará INATIVA e preservada no histórico. Prosseguir?`)) return;
    const historicalOnly = mode === "new" && Boolean(exact && compareTableDates(currentExact?.sourceDate ?? "", doc.tableDate) !== "newer");
    if (historicalOnly && !window.confirm(`Registrar como histórico INATIVO para ${candidate.project} — ${candidate.typology}?\n\nVersão existente: ${currentExact?.sourceDate} · ${formatBRL(currentExact?.priceCents ?? currentExact?.priceLowCents ?? null)}\nDocumento: ${doc.tableDate} · ${formatBRL(candidate.priceCents)}\n\nA versão ativa permanecerá inalterada.`)) return;
    const unitId = createId("unit");
    const versionAnchor = previous ?? currentExact;
    const versionGroupId = versionAnchor?.versionGroupId ?? (versionAnchor ? createId("catalog-version") : undefined);
    const unit: PortfolioUnit = {
      id: unitId,
      project: candidate.project.trim(), neighborhood: candidate.neighborhood?.trim() || "Não informado",
      region: candidate.region ?? "Zona Norte", typology: candidate.typology.trim(), bedrooms: candidate.bedrooms,
      parking: candidate.parking ?? "unknown", areaM2: candidate.areaM2,
      priceCents: candidate.priceCents, deliveryMonth: candidate.deliveryMonth, deliveryYear: candidate.deliveryYear,
      deliveryText: candidate.deliveryText.trim() || "Entrega a confirmar",
      source: doc.name, sourceDate: doc.tableDate,
      internalNote: `Valor extraído e revisado manualmente no Cury Fluxo. Confirme unidade, tabela e disponibilidade no espelho oficial. Trecho de origem: ${candidate.label}`,
      active: !historicalOnly, versionGroupId,
    };
    setWorkspace((current) => ({
      ...current,
      portfolio: [unit, ...current.portfolio.map((item) => item.id === previous?.id ? {
        ...item, active: false, versionGroupId, replacedById: unit.id,
        internalNote: `${item.internalNote ? `${item.internalNote} ` : ""}Versão substituída manualmente em ${doc.tableDate} por ${doc.name}; preservada como inativa.`,
      } : item)],
    }));
    patchCandidate(doc, index, { project: candidate.project, typology: candidate.typology, confirmed: false, addedUnitId: unit.id });
    setNotice(previous
      ? `Nova versão de ${unit.project} ativada; a versão de ${previous.sourceDate} foi inativada e preservada no histórico.`
      : historicalOnly
        ? `Versão histórica de ${unit.project} registrada como inativa. O catálogo ativo não foi alterado.`
        : `${unit.project} foi cadastrado como referência local sem substituir registros existentes. Confirme no espelho oficial antes de usar.`);
  };
  const openOriginal = async (doc: ImportedDocument) => {
    try {
      const blob = await getOriginalFile(doc.id);
      if (!blob) { setError("Arquivo original não está salvo neste navegador; reimporte-o se precisar abrir."); return; }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = doc.name; anchor.target = "_blank"; anchor.rel = "noopener"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch { setError("Não foi possível abrir o arquivo original local."); }
  };
  const removeDocument = async (doc: ImportedDocument) => {
    if (!window.confirm(`Remover “${doc.name}” e o original salvo neste navegador? Unidades que você já cadastrou não serão removidas.`)) return;
    setWorkspace((current) => ({ ...current, documents: current.documents.filter((item) => item.id !== doc.id) }));
    await deleteOriginalFile(doc.id).catch(() => undefined);
    setSelectedId(""); setNotice("Documento removido.");
  };
  const markReviewed = (doc: ImportedDocument) => {
    patchDocument(doc.id, { status: "reviewed", note: "Texto extraído revisado pelo consultor. Isso não confirma preço, disponibilidade ou condição comercial vigente." });
    setNotice("Documento marcado como revisado localmente. Confirme a tabela vigente no espelho oficial.");
  };
  const rows = workspace.documents;

  return (
    <div className="page-stack import-page">
      <div className="page-heading"><div><div className="eyebrow">ENTRADA DE TABELAS</div><h1>Receba o arquivo. Revise os dados.</h1><p>Importe tabelas Cury em PDF ou imagem, ou cadastre unidades manualmente no catálogo. Nada é gravado como preço sem sua conferência.</p></div></div>
      <section className={`upload-zone ${dragOver ? "drag-over" : ""} ${busy ? "is-busy" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); void addFile(event.dataTransfer.files[0]); }}>
        <input ref={fileRef} type="file" accept="application/pdf,image/*,.pdf" hidden onChange={(event) => void addFile(event.target.files?.[0])} />
        <div className="upload-symbol">{busy ? <LoaderCircle size={24} className="spin" /> : <Upload size={24} />}</div>
        <div className="upload-copy"><strong>{busy ? "Lendo a tabela no navegador…" : "Solte um PDF ou imagem aqui"}</strong><p>ou escolha um arquivo do dispositivo · PDF, JPG, PNG e WebP · até 25 MB</p></div>
        <button className="button button-primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Processando" : "Selecionar arquivo"}</button>
        {progress && <div className="upload-progress"><div><span>{progress.detail}</span><strong>{Math.round(progress.progress * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${Math.max(5, progress.progress * 100)}%` }} /></div></div>}
      </section>
      <div className="import-feature-row"><div><FileText size={17} /><span><strong>PDF pesquisável</strong><small>Leitura local de texto sem enviar o arquivo.</small></span></div><div><ScanText size={17} /><span><strong>PDF digitalizado e imagem</strong><small>OCR em português acionado durante a importação.</small></span></div><div><ShieldCheckIcon /><span><strong>Revisão obrigatória</strong><small>Preço e unidade só entram no catálogo após conferência.</small></span></div></div>
      {(error || notice) && <div className={`import-message ${error ? "error" : "success"}`}>{error ? <AlertCircle size={15} /> : <Check size={15} />}{error || notice}<button className="icon-button" onClick={() => { setError(""); setNotice(""); }} aria-label="Fechar"><X size={14} /></button></div>}
      <div className="import-layout">
        <section className="panel imported-list"><div className="section-heading"><div><span className="eyebrow">ARQUIVOS NESTE NAVEGADOR</span><h2>Documentos recebidos</h2></div><span className="count-badge">{rows.length}</span></div>
          {rows.length ? <div className="import-doc-list">{rows.map((doc) => <button key={doc.id} className={`import-doc-row ${selected?.id === doc.id ? "active" : ""}`} onClick={() => setSelectedId(doc.id)}><span className="doc-icon"><FileImage size={17} /></span><span className="doc-main"><strong>{doc.name}</strong><small>{dateLabel(doc.importedAt)} · {bytesLabel(doc.sizeBytes)}</small></span><span className={`doc-status ${doc.status}`}>{doc.status === "reviewed" ? "REVISADO" : "RASCUNHO"}</span></button>)}</div> : <div className="client-empty"><FileText size={22} /><p>Seus arquivos importados aparecerão aqui.</p><small>O arquivo original e o texto extraído ficam neste navegador.</small></div>}
        </section>
        <section className="panel document-review">
          {selected ? <>
            <div className="section-heading"><div><span className="eyebrow">REVISÃO DO RASCUNHO</span><h2>{selected.name}</h2></div><button className="icon-button danger-quiet" title="Remover documento" aria-label={`Remover documento ${selected.name}`} onClick={() => void removeDocument(selected)}><Trash2 size={16} /></button></div>
            <div className="document-meta"><span>Importado {dateLabel(selected.importedAt)}</span><span>{bytesLabel(selected.sizeBytes)}</span><span>Origem: {selected.source}</span><button className="text-button" onClick={() => void openOriginal(selected)}><ArrowDownToLine size={13} /> Abrir original</button></div>
              <div className="form-grid document-meta-fields"><label className="form-field"><span>Data da tabela / campanha</span><input type="date" value={selected.tableDate} onChange={(event) => patchDocument(selected.id, { tableDate: event.target.value, source: selected.name })} /><small>Não é a data de importação; confirme no documento antes de cadastrar.</small></label><label className="form-field"><span>Nota interna</span><input value={selected.note} onChange={(event) => patchDocument(selected.id, { note: event.target.value })} /></label></div>
            {selected.pagesTotal !== undefined && <div className="field-note"><Info size={14} /><span>{selected.pagesProcessed ?? 0} de {selected.pagesTotal} páginas processadas. {selected.pagesTotal > (selected.pagesProcessed ?? 0) ? "As páginas restantes não foram processadas para controlar o tempo de OCR." : ""}</span></div>}
            <div className="candidate-section"><div className="candidate-heading"><div><h3>Valores candidatos detectados</h3><p>Confira linha e valor no original, preencha empreendimento/tipologia, marque revisado e só então cadastre.</p></div><span>{selected.candidatePrices.length} itens</span></div>
              {selected.candidatePrices.length ? <div className="candidate-list">{selected.candidatePrices.map((candidate, index) => {
                const matches = findCatalogVersionMatches(workspace.portfolio, candidate);
                const selectionKey = `${selected.id}:${index}`;
                const chosenMatch = matches.find((unit) => unit.id === versionSelections[selectionKey]) ?? matches.find((unit) => unit.active !== false) ?? matches[0];
                const dateComparison = chosenMatch ? compareTableDates(chosenMatch.sourceDate, selected.tableDate) : null;
                const exactVariant = Boolean(chosenMatch && normalizeCatalogTypology(chosenMatch.typology) === normalizeCatalogTypology(candidate.typology ?? ""));
                const activeExactMatch = matches.find((unit) => normalizeCatalogTypology(unit.typology) === normalizeCatalogTypology(candidate.typology ?? "") && unit.active !== false);
                const comparison = activeExactMatch ? compareTableDates(activeExactMatch.sourceDate, selected.tableDate) : dateComparison;
                const canSupersede = Boolean(exactVariant && activeExactMatch && chosenMatch?.id === activeExactMatch.id && comparison === "newer");
                const canAdd = Boolean(selected.tableDate && candidate.confirmed && !candidate.addedUnitId && candidate.project?.trim() && candidate.typology?.trim() && candidate.priceCents !== null);
                return <div className="candidate-card" key={`${selected.id}-${index}`}>
                  <div className="candidate-source"><span className="candidate-number">{String(index + 1).padStart(2, "0")}</span><label className="form-field"><span>Trecho extraído do documento</span><input value={candidate.label} onChange={(event) => patchCandidate(selected, index, { label: event.target.value })} /></label></div>
                  <div className="form-grid candidate-grid">
                    <label className="form-field"><span>Preço detectado</span><div className="money-control"><span>R$</span><CurrencyInput value={candidate.priceCents} onChange={(value) => patchCandidate(selected, index, { priceCents: value })} min="0" placeholder="0,00" /></div></label>
                    <label className="form-field"><span>Empreendimento *</span><input value={candidate.project ?? ""} onChange={(event) => patchCandidate(selected, index, { project: event.target.value })} placeholder="Preencher após conferir" /></label>
                    <label className="form-field"><span>Tipologia / variante *</span><input value={candidate.typology ?? ""} onChange={(event) => patchCandidate(selected, index, { typology: event.target.value })} placeholder="Ex.: 2Q s/ vaga" /></label>
                    <label className="form-field"><span>Quartos</span><input type="number" min="0" max="10" value={candidate.bedrooms ?? ""} onChange={(event) => patchCandidate(selected, index, { bedrooms: event.target.value ? Number(event.target.value) : undefined })} /></label>
                    <label className="form-field"><span>Vaga</span><select value={candidate.parking === undefined || candidate.parking === "unknown" ? "unknown" : candidate.parking ? "yes" : "no"} onChange={(event) => patchCandidate(selected, index, { parking: event.target.value === "unknown" ? "unknown" : event.target.value === "yes" })}><option value="unknown">A confirmar</option><option value="yes">Com vaga</option><option value="no">Sem vaga</option></select></label>
                    <label className="form-field"><span>Bairro</span><input value={candidate.neighborhood ?? ""} onChange={(event) => patchCandidate(selected, index, { neighborhood: event.target.value })} placeholder="Confirmar" /></label>
                    <label className="form-field"><span>Região</span><select value={candidate.region ?? "Zona Norte"} onChange={(event) => patchCandidate(selected, index, { region: event.target.value as PortfolioUnit["region"] })}>{REGIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label className="form-field"><span>Área (m²), se constar</span><input type="number" min="0" step="0.1" value={candidate.areaM2 ?? ""} onChange={(event) => patchCandidate(selected, index, { areaM2: event.target.value ? Number(event.target.value) : undefined })} /></label>
                    <label className="form-field"><span>Entrega informada</span><input value={candidate.deliveryText} onChange={(event) => patchCandidate(selected, index, { deliveryText: event.target.value })} placeholder="Ex.: Entrega 2028" /></label>
                    <label className="form-field"><span>Mês (se constar)</span><select value={candidate.deliveryMonth ?? ""} onChange={(event) => patchCandidate(selected, index, { deliveryMonth: event.target.value ? Number(event.target.value) : undefined })}><option value="">Não informado</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, i, 1))}</option>)}</select></label>
                    <label className="form-field"><span>Ano (se constar)</span><input type="number" min="2026" max="2040" value={candidate.deliveryYear ?? ""} onChange={(event) => patchCandidate(selected, index, { deliveryYear: event.target.value ? Number(event.target.value) : undefined })} placeholder="—" /></label>
                  </div>
                  {matches.length > 0 && <div className="version-review-panel"><div className="section-heading"><div><span className="eyebrow">POSSÍVEL VERSÃO JÁ CADASTRADA</span><h4>Compare antes de decidir</h4></div></div>
                    {matches.length > 1 && <label className="form-field"><span>Escolha qual registro substituir (se for a mesma variante)</span><select value={chosenMatch?.id ?? ""} onChange={(event) => setVersionSelections((current) => ({ ...current, [selectionKey]: event.target.value }))}>{matches.map((unit) => <option key={unit.id} value={unit.id}>{unit.typology} · {unit.sourceDate} · {unit.active === false ? "inativa" : "ativa"} · {unit.source}</option>)}</select></label>}
                    <div className="version-compare-row"><div><strong>Nova tabela · aguardando confirmação</strong><span>{selected.tableDate || "Data não confirmada"} · {selected.name}</span><b>{formatBRL(candidate.priceCents)}</b></div>{chosenMatch && <div><strong>Versão cadastrada · {chosenMatch.active === false ? "INATIVA" : "ATIVA"}</strong><span>{chosenMatch.sourceDate} · {chosenMatch.source}</span><b>{formatBRL(chosenMatch.priceCents ?? chosenMatch.priceLowCents ?? null)}</b></div>}</div>
                    {!exactVariant && <p className="small-note">O projeto parece coincidir, mas a tipologia não é exatamente equivalente; cadastre como variação separada para não inativar outra planta.</p>}
                    {exactVariant && activeExactMatch && chosenMatch?.id !== activeExactMatch.id && comparison === "newer" && <p className="small-note">Há uma versão ativa mais recente. Se esta tabela for posterior à ativa, selecione a versão ativa na lista antes de confirmar a substituição.</p>}
                    {exactVariant && comparison !== "newer" && <p className="small-note">A data desta importação não é posterior à versão ativa mais recente ({comparison === "same" ? "mesma data" : comparison === "older" ? "mais antiga" : "data inválida/ausente"}). A versão ativa não será substituída; se você optar por registrar o documento, ele ficará inativo no histórico.</p>}
                  </div>}
                  <div className="candidate-footer"><label className="check-field"><input type="checkbox" checked={candidate.confirmed} disabled={Boolean(candidate.addedUnitId)} onChange={(event) => patchCandidate(selected, index, { confirmed: event.target.checked })} /><span>{candidate.addedUnitId ? "Unidade cadastrada no catálogo local." : "Conferi preço, variante, data e identificação no arquivo original."}</span></label>
                    {candidate.addedUnitId ? <button className="button button-quiet button-small" disabled><Check size={13} /> Adicionado</button> : <div className="form-actions">
                      {matches.length === 0 ? <button className="button button-quiet button-small" disabled={!canAdd} onClick={() => addCandidateToCatalog(selected, index, "new")}><Plus size={13} /> Cadastrar nova unidade</button> : <>
                        {canSupersede && chosenMatch && <button className="button button-primary button-small" disabled={!canAdd} onClick={() => addCandidateToCatalog(selected, index, "supersede", chosenMatch.id)}>Confirmar atualização e inativar anterior</button>}
                        {!exactVariant && <button className="button button-quiet button-small" disabled={!canAdd} onClick={() => addCandidateToCatalog(selected, index, "new")}><Plus size={13} /> Cadastrar como variação separada</button>}
                        {exactVariant && comparison !== "newer" && <button className="button button-quiet button-small" disabled={!canAdd} onClick={() => addCandidateToCatalog(selected, index, "new")}><Plus size={13} /> Registrar apenas no histórico (inativa)</button>}
                        {exactVariant && chosenMatch?.active === false && dateComparison === "newer" && !activeExactMatch && <button className="button button-primary button-small" disabled={!canAdd} onClick={() => addCandidateToCatalog(selected, index, "new")}><Plus size={13} /> Ativar versão mais nova</button>}
                      </>}
                    </div>}
                  </div>
                </div>;
              })}</div> : <div className="no-candidates"><AlertCircle size={18} /><div><strong>Nenhum valor detectável.</strong><p>Confira o original e cadastre a unidade manualmente no Catálogo. Nenhum preço foi inventado.</p></div></div>}
            </div>
            <details className="raw-text-details"><summary>Ver / corrigir texto extraído</summary><textarea rows={11} value={selected.rawText} onChange={(event) => patchDocument(selected.id, { rawText: event.target.value, status: "draft" })} placeholder="O texto extraído aparecerá aqui." /></details>
            <div className="form-footer"><span className="small-note">Revisão local não confirma preço vigente ou disponibilidade.</span><button className="button button-primary" onClick={() => markReviewed(selected)}><Check size={15} /> Marcar revisão concluída</button></div>
          </> : <div className="document-empty"><div className="empty-illustration"><FileText size={25} /></div><strong>Escolha um documento para revisar.</strong><p>Os valores detectados nunca são adicionados automaticamente ao catálogo.</p></div>}
        </section>
      </div>
    </div>
  );
}

function ShieldCheckIcon() { return <span className="shield-check-small"><Check size={13} /></span>; }
