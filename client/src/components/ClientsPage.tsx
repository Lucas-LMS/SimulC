import { useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ClipboardPaste, FileImage, Plus, Search, Upload, UserRound, Users, X } from "lucide-react";
import type { ClientPriceProfile, ClientProfile, WorkspaceData } from "../lib/models";
import type { Dispatch, SetStateAction } from "react";
import { formatBRL } from "../lib/money";
import { Info } from "lucide-react";
import { createId } from "../lib/storage";
import { parseLeadForm, recommendUnitsForLead, type LeadDraft } from "../lib/leads";
import { makeNewSimulation } from "./SimulatorPage";
import { clientPriceProfileToSimulation, projectClientPriceProfile } from "../lib/clientPriceProfile";
import CurrencyInput from "./CurrencyInput";
import { parseTableFile } from "../lib/importFiles";
import { parseGpmText } from "../lib/gpm";

interface Props {
  workspace: WorkspaceData;
  setWorkspace: Dispatch<SetStateAction<WorkspaceData>>;
  onSimulate: (clientId: string) => void;
}

const blankClient = (): ClientProfile => ({
  id: createId("client"), name: "", phone: "", incomeIndividualCents: null, incomeFamilyCents: null,
  incomeComposition: "", oldestBuyerAge: null, availableActCents: null, monthlyCapacityCents: null,
  annualCapacityCents: null, desiredTermMonths: null, fgtsBalanceCents: null, fgtsTimeYears: null,
  notes: "", updatedAt: new Date().toISOString(),
});

const blankPriceProfile = (): ClientPriceProfile => ({
  priceReferenceCents: null, financingAmountCents: null, firstPriceInstallmentCents: null,
  gpmReportedFinancingAmountCents: null,
  financingTermMonths: null, financingLine: "", financingSystem: "PRICE", financingRate: "",
  financingNotes: "", source: "", sourceDate: "", gpmReportedSubsidyCents: null,
  gpmReportedFees: "", gpmReportedQuotaPercent: null, gpmReportedIncomeCommitmentPercent: null,
  updatedAt: new Date().toISOString(),
});

const normalizePhone = (phone: string) => phone.replace(/\D/g, "");
const MoneyInput = ({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (value: number | null) => void; hint?: string }) => (
  <label className="form-field"><span>{label}</span><div className="money-control"><span>R$</span><CurrencyInput value={value} onChange={onChange} min="0" placeholder="0,00" /></div>{hint && <small>{hint}</small>}</label>
);

export default function ClientsPage({ workspace, setWorkspace, onSimulate }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<ClientProfile | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadText, setLeadText] = useState("");
  const [leadReview, setLeadReview] = useState<LeadDraft | null>(null);
  const [leadError, setLeadError] = useState("");
  const [leadNotice, setLeadNotice] = useState("");
  const priceFileRef = useRef<HTMLInputElement>(null);
  const [priceImportBusy, setPriceImportBusy] = useState(false);
  const [priceImportNotice, setPriceImportNotice] = useState("");
  const clients = useMemo(() => workspace.clients.filter((client) => `${client.name} ${client.phone}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))), [workspace.clients, search]);
  const selected = workspace.clients.find((client) => client.id === selectedId);
  const form = draft ?? selected ?? blankClient();
  const leadRecommendations = useMemo(() => leadReview ? recommendUnitsForLead(leadReview, workspace.portfolio) : [], [leadReview, workspace.portfolio]);
  const duplicateLead = leadReview && normalizePhone(leadReview.phone).length >= 8
    ? workspace.clients.find((client) => normalizePhone(client.phone) === normalizePhone(leadReview.phone))
    : undefined;

  const update = (patch: Partial<ClientProfile>) => {
    setSavedNotice(false);
    setDraft((current) => ({ ...(current ?? form), ...patch, updatedAt: new Date().toISOString() }));
  };
  const updatePriceProfile = (patch: Partial<ClientPriceProfile>) => {
    update({ priceProfile: { ...(form.priceProfile ?? blankPriceProfile()), ...patch, updatedAt: new Date().toISOString() } });
  };
  const importPriceDocument = async (file?: File) => {
    if (!file) return;
    setPriceImportBusy(true); setPriceImportNotice("");
    try {
      const parsed = await parseTableFile(file, true, () => undefined);
      const values = parseGpmText(parsed.rawText);
      if (!Object.values(values).some((value) => value !== null)) throw new Error("Não encontrei campos PRICE/GPM. Confira se o documento está legível.");
      updatePriceProfile({
        ...(values.propertyPriceCents !== null ? { priceReferenceCents: values.propertyPriceCents } : {}),
        ...(values.financingAmountCents !== null ? { financingAmountCents: values.financingAmountCents, gpmReportedFinancingAmountCents: values.financingAmountCents } : {}),
        ...(values.firstInstallmentCents !== null ? { firstPriceInstallmentCents: values.firstInstallmentCents, gpmReportedFirstPriceInstallmentCents: values.firstInstallmentCents } : {}),
        ...(values.termMonths !== null ? { financingTermMonths: values.termMonths } : {}),
        ...(values.financingLine ? { financingLine: values.financingLine } : {}),
        ...(values.financingSystem ? { financingSystem: values.financingSystem } : {}),
        ...(values.rate ? { financingRate: values.rate } : {}),
        ...(values.subsidyCents !== null ? { gpmReportedSubsidyCents: values.subsidyCents } : {}),
        ...(values.fees ? { gpmReportedFees: values.fees } : {}),
        ...(values.quotaPercent !== null ? { gpmReportedQuotaPercent: values.quotaPercent } : {}),
        ...(values.incomeCommitmentPercent !== null ? { gpmReportedIncomeCommitmentPercent: values.incomeCommitmentPercent } : {}),
        source: file.name || "Imagem colada · PRICE/GPM", sourceDate: new Date().toISOString().slice(0, 10),
      });
      setPriceImportNotice("Dados identificados e preenchidos para revisão. Confira cada campo antes de salvar o perfil.");
    } catch (error) { setPriceImportNotice(error instanceof Error ? error.message : "Não foi possível ler o documento."); }
    finally { setPriceImportBusy(false); if (priceFileRef.current) priceFileRef.current.value = ""; }
  };
  const pastePriceImage = (event: React.ClipboardEvent<HTMLElement>) => {
    const imageItem = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (file) { event.preventDefault(); void importPriceDocument(new File([file], "imagem-colada.png", { type: file.type || "image/png" })); }
  };
  const startNew = () => { const next = blankClient(); setSelectedId(""); setDraft(next); setSavedNotice(false); };
  const open = (client: ClientProfile) => { setSelectedId(client.id); setDraft(client); setSavedNotice(false); };
  const save = () => {
    if (!form.name.trim()) return;
    const next = { ...form, name: form.name.trim(), updatedAt: new Date().toISOString() };
    setWorkspace((current) => ({ ...current, clients: current.clients.some((client) => client.id === next.id) ? current.clients.map((client) => client.id === next.id ? next : client) : [next, ...current.clients] }));
    setSelectedId(next.id); setDraft(next); setSavedNotice(true);
  };
  const remove = () => {
    if (!selected || !window.confirm(`Excluir o perfil de ${selected.name}? Simulações existentes não serão apagadas.`)) return;
    setWorkspace((current) => ({ ...current, clients: current.clients.filter((client) => client.id !== selected.id) }));
    setSelectedId(""); setDraft(null);
  };
  const interpretLead = () => {
    if (!leadText.trim()) { setLeadError("Cole o texto completo do formulário para interpretar."); return; }
    const parsed = parseLeadForm(leadText);
    if (!parsed.name && !parsed.phone && !parsed.incomeFamilyCents && !parsed.preferences.desiredAreas) {
      setLeadError("Não encontrei campos reconhecíveis. Confira o texto e tente novamente.");
      setLeadReview(null);
      return;
    }
    setLeadError(""); setLeadNotice(""); setLeadReview(parsed);
  };
  const updateLead = (patch: Partial<LeadDraft>) => setLeadReview((current) => current ? { ...current, ...patch } : current);
  const saveLead = (updateDuplicate = false) => {
    if (!leadReview?.name.trim()) { setLeadError("Informe o nome do cliente antes de salvar."); return; }
    const now = new Date().toISOString();
    setWorkspace((current) => {
      const existing = updateDuplicate ? current.clients.find((client) => client.id === duplicateLead?.id) : undefined;
      const profile: ClientProfile = existing ? {
        ...existing,
        name: leadReview.name.trim() || existing.name,
        phone: leadReview.phone.trim() || existing.phone,
        incomeFamilyCents: leadReview.incomeFamilyCents ?? existing.incomeFamilyCents,
        oldestBuyerAge: leadReview.oldestBuyerAge ?? existing.oldestBuyerAge,
        fgtsBalanceCents: leadReview.fgtsBalanceCents ?? existing.fgtsBalanceCents,
        employmentRegime: leadReview.employmentRegime || existing.employmentRegime,
        threeYearsWorkHistory: leadReview.threeYearsWorkHistory ?? existing.threeYearsWorkHistory,
        preferences: leadReview.preferences,
        updatedAt: now,
      } : {
        ...blankClient(),
        name: leadReview.name.trim(), phone: leadReview.phone.trim(),
        incomeFamilyCents: leadReview.incomeFamilyCents, oldestBuyerAge: leadReview.oldestBuyerAge,
        fgtsBalanceCents: leadReview.fgtsBalanceCents, employmentRegime: leadReview.employmentRegime,
        threeYearsWorkHistory: leadReview.threeYearsWorkHistory, preferences: leadReview.preferences,
        updatedAt: now,
      };
      const recommendations = recommendUnitsForLead(profile, current.portfolio);
      const existingRecommendations = new Set(current.simulations.filter((simulation) => simulation.clientId === profile.id && simulation.origin === "lead_recommendation").map((simulation) => simulation.propertyId));
      const newDrafts = recommendations.filter((item) => !existingRecommendations.has(item.unit.id)).map((item) => {
        const targetPrice = item.unit.priceCents ?? item.unit.priceLowCents ?? null;
        const priceProjection = projectClientPriceProfile(profile.priceProfile, targetPrice);
        return {
          ...makeNewSimulation(profile.id, item.unit.id),
          ...clientPriceProfileToSimulation(profile.priceProfile, targetPrice),
          origin: "lead_recommendation" as const,
          recommendation: { score: item.score, reasons: item.reasons, mismatches: item.mismatches },
          internalNotes: profile.priceProfile
            ? `Rascunho recomendado por preferências do lead. ${priceProjection.message} Revise contra um GPM/PRICE atualizado; não representa aprovação ou disponibilidade.`
            : "Rascunho recomendado por preferências do lead. PRICE/GPM pendente; não contém análise financeira, condição bancária nem confirmação de disponibilidade.",
        };
      });
      return {
        ...current,
        clients: existing
          ? current.clients.map((client) => client.id === existing.id ? profile : client)
          : [profile, ...current.clients],
        simulations: [...newDrafts, ...current.simulations],
      };
    });
    setSelectedId(duplicateLead && updateDuplicate ? duplicateLead.id : "");
    setDraft(null);
    setLeadNotice(`Perfil salvo${leadRecommendations.length ? `; ${leadRecommendations.length} opção(ões) recomendada(s) avaliada(s) e rascunhos criados` : "; nenhuma opção do catálogo correspondeu"}. Confira cada rascunho antes de simular.`);
    setLeadReview(null);
    setLeadText("");
  };

  return (
    <div className="page-stack clients-page">
      <div className="page-heading page-heading-row"><div><div className="eyebrow">RELACIONAMENTO</div><h1>Perfis de clientes</h1><p>Guarde a renda e a capacidade informadas para reutilizá-las nos fluxos.</p></div><div className="form-actions"><button className="button button-quiet" onClick={() => { setLeadOpen((open) => !open); setLeadReview(null); setLeadError(""); setLeadNotice(""); }}><ClipboardPaste size={15} /> Importar formulário</button><button className="button button-primary" onClick={startNew}><Plus size={16} /> Novo perfil</button></div></div>
      {leadOpen && <section className="panel lead-intake-panel">
        <div className="section-heading"><div><span className="eyebrow">PRÉVIA · NENHUM DADO SALVO AINDA</span><h2>Interpretar formulário de lead</h2><p>Cole as respostas rotuladas; confira e corrija os campos antes de salvar.</p></div><button className="icon-button" aria-label="Fechar importação de lead" onClick={() => setLeadOpen(false)}><X size={16} /></button></div>
        {!leadReview && <><label className="form-field"><span>Texto copiado do formulário</span><textarea rows={8} value={leadText} onChange={(event) => setLeadText(event.target.value)} placeholder={'Qual região mais interessa?\nBarra / Recreio\nQuantos quartos?\n3 quartos com vaga\n…'} /></label><div className="form-footer"><span className="form-privacy">Não salve CPF nem a data completa de nascimento.</span><button className="button button-primary" onClick={interpretLead}><ClipboardPaste size={15} /> Interpretar respostas</button></div></>}
        {leadReview && <>
          <div className="form-grid lead-review-fields">
            <label className="form-field span-2"><span>Nome</span><input value={leadReview.name} onChange={(event) => updateLead({ name: event.target.value })} /></label>
            <label className="form-field"><span>WhatsApp / telefone</span><input type="tel" value={leadReview.phone} onChange={(event) => updateLead({ phone: event.target.value })} /></label>
            <MoneyInput label="Renda familiar mensal" value={leadReview.incomeFamilyCents} onChange={(value) => updateLead({ incomeFamilyCents: value })} />
            <label className="form-field"><span>Idade derivada</span><div className="unit-control"><input type="number" min="18" max="110" value={leadReview.oldestBuyerAge ?? ""} onChange={(event) => updateLead({ oldestBuyerAge: event.target.value ? Number(event.target.value) : null })} placeholder="Não identificada" /><span>anos</span></div><small>A data completa não é mantida no perfil.</small></label>
            <label className="form-field"><span>Regime trabalhista informado</span><input value={leadReview.employmentRegime} onChange={(event) => updateLead({ employmentRegime: event.target.value })} /></label>
            <label className="form-field"><span>3+ anos de carteira?</span><select value={leadReview.threeYearsWorkHistory === null ? "unknown" : leadReview.threeYearsWorkHistory ? "yes" : "no"} onChange={(event) => updateLead({ threeYearsWorkHistory: event.target.value === "unknown" ? null : event.target.value === "yes" })}><option value="unknown">Não identificado</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
            <MoneyInput label="FGTS informado" value={leadReview.fgtsBalanceCents} onChange={(value) => updateLead({ fgtsBalanceCents: value })} hint="Não confirma elegibilidade de uso." />
            <label className="form-field"><span>Região / bairros preferidos</span><input value={leadReview.preferences.desiredAreas} onChange={(event) => updateLead({ preferences: { ...leadReview.preferences, desiredAreas: event.target.value } })} /></label>
            <label className="form-field"><span>Quartos desejados</span><input type="number" min="0" max="10" value={leadReview.preferences.bedrooms ?? ""} onChange={(event) => updateLead({ preferences: { ...leadReview.preferences, bedrooms: event.target.value ? Number(event.target.value) : null } })} /></label>
            <label className="form-field"><span>Vaga desejada</span><select value={leadReview.preferences.parking === null ? "unknown" : leadReview.preferences.parking ? "yes" : "no"} onChange={(event) => updateLead({ preferences: { ...leadReview.preferences, parking: event.target.value === "unknown" ? null : event.target.value === "yes" } })}><option value="unknown">Não identificada</option><option value="yes">Com vaga</option><option value="no">Sem vaga</option></select></label>
            <label className="form-field"><span>Ano de entrega desejado</span><input type="number" min="2026" max="2040" value={leadReview.preferences.deliveryYear ?? ""} onChange={(event) => updateLead({ preferences: { ...leadReview.preferences, deliveryYear: event.target.value ? Number(event.target.value) : null } })} /></label>
          </div>
          {duplicateLead && <div className="reference-alert"><Users size={17} /><div><strong>Este telefone já está em {duplicateLead.name}.</strong><p>Escolha explicitamente se deseja atualizar esse perfil ou salvar um cadastro separado. Não haverá atualização automática.</p></div></div>}
          <div className="lead-recommendations"><div className="section-heading"><div><span className="eyebrow">CORRESPONDÊNCIA DE PREFERÊNCIAS</span><h3>{leadRecommendations.length ? `${leadRecommendations.length} opção(ões) sugerida(s)` : "Sem correspondência clara no catálogo ativo"}</h3></div></div>
            {leadRecommendations.map((item) => <article className="lead-recommendation-card" key={item.unit.id}><div><strong>{item.unit.project}</strong><span>{item.unit.typology} · {item.unit.neighborhood || item.unit.region}</span><small>{item.reasons.join(" ") || "Correspondência parcial."}{item.mismatches.length ? ` ${item.mismatches.join(" ")}` : ""}</small></div><div className="lead-recommendation-price"><strong>{formatBRL(item.unit.priceCents ?? item.unit.priceLowCents ?? null)}</strong><span>{item.unit.source} · {item.unit.sourceDate}</span><span>{item.score}/100 de correspondência</span></div></article>)}
            <p className="small-note">Todas as opções compatíveis no catálogo aparecem sem limite por cliente. A correspondência reflete apenas região, tipologia, vaga e entrega; cada simulação fica salva como rascunho com PRICE/GPM pendente, sem análise financeira ou confirmação de disponibilidade.</p>
          </div>
          {leadError && <div className="inline-status error-status">{leadError}</div>}
          <div className="form-footer"><span className="form-privacy">Somente os campos revisados serão salvos; data completa e CPF não são persistidos.</span><div className="form-actions"><button className="button button-quiet" onClick={() => setLeadReview(null)}>Voltar ao texto</button>{duplicateLead ? <><button className="button button-quiet" onClick={() => saveLead(false)}>Salvar como novo</button><button className="button button-primary" onClick={() => saveLead(true)}>Atualizar perfil existente</button></> : <button className="button button-primary" onClick={() => saveLead(false)}><Check size={15} /> Salvar e criar rascunhos</button>}</div></div>
        </>}
        {leadError && !leadReview && <div className="inline-status error-status">{leadError}</div>}
        {leadNotice && <div className="inline-status"><Check size={14} />{leadNotice}</div>}
      </section>}
      <div className="split-workspace clients-workspace">
        <section className="panel client-list-panel">
          <div className="list-panel-heading"><div><span className="eyebrow">CARTEIRA</span><strong>{workspace.clients.length} {workspace.clients.length === 1 ? "perfil" : "perfis"}</strong></div><div className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente" /></div></div>
          {clients.length ? <div className="client-list">{clients.map((client) => <button key={client.id} className={`client-row ${form.id === client.id ? "selected" : ""}`} onClick={() => open(client)}><span className="client-avatar"><UserRound size={18} /></span><span className="client-row-copy"><strong>{client.name || "Sem nome"}</strong><small>{client.phone || "Telefone não informado"}</small></span><span className="client-income">{client.incomeFamilyCents !== null ? formatBRL(client.incomeFamilyCents) : "Renda —"}<small>renda familiar</small></span></button>)}</div> : <div className="client-empty"><Users size={22} /><p>{search ? "Nenhum perfil encontrado." : "Nenhum cliente cadastrado ainda."}</p><button className="text-button" onClick={startNew}>Criar o primeiro <ArrowRight size={14} /></button></div>}
        </section>
        <section className="panel client-form-panel">
          <div className="section-heading"><div><span className="eyebrow">DADOS DO CLIENTE</span><h2>{selected ? selected.name : "Novo perfil"}</h2></div>{selected && <button className="icon-button danger-quiet" aria-label="Excluir cliente" onClick={remove}><X size={17} /></button>}</div>
          <div className="form-grid">
            <label className="form-field span-2"><span>Nome do cliente <b>*</b></span><input value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder="Nome e sobrenome" /></label>
            <label className="form-field"><span>WhatsApp / telefone</span><input type="tel" value={form.phone} onChange={(event) => update({ phone: event.target.value })} placeholder="(21) 99999-0000" /></label>
            <label className="form-field"><span>Idade do comprador mais velho</span><div className="unit-control"><input type="number" min="18" max="100" value={form.oldestBuyerAge ?? ""} onChange={(event) => update({ oldestBuyerAge: event.target.value ? Number(event.target.value) : null })} placeholder="—" /><span>anos</span></div><small>Referência para revisar prazo Caixa informado.</small></label>
            <MoneyInput label="Renda individual" value={form.incomeIndividualCents} onChange={(value) => update({ incomeIndividualCents: value })} />
            <MoneyInput label="Renda familiar mensal" value={form.incomeFamilyCents} onChange={(value) => update({ incomeFamilyCents: value })} hint="Base para calcular o percentual da mensal." />
            <label className="form-field span-2"><span>Composição da renda</span><input value={form.incomeComposition} onChange={(event) => update({ incomeComposition: event.target.value })} placeholder="Ex.: cliente + cônjuge" /></label>
            <MoneyInput label="Ato disponível informado" value={form.availableActCents} onChange={(value) => update({ availableActCents: value })} />
            <MoneyInput label="Capacidade mensal informada" value={form.monthlyCapacityCents} onChange={(value) => update({ monthlyCapacityCents: value })} />
            <MoneyInput label="Capacidade anual informada" value={form.annualCapacityCents} onChange={(value) => update({ annualCapacityCents: value })} />
            <label className="form-field"><span>Prazo desejado</span><div className="unit-control"><input type="number" min="1" value={form.desiredTermMonths ?? ""} onChange={(event) => update({ desiredTermMonths: event.target.value ? Number(event.target.value) : null })} placeholder="—" /><span>meses</span></div></label>
            <MoneyInput label="Saldo FGTS (se informado)" value={form.fgtsBalanceCents} onChange={(value) => update({ fgtsBalanceCents: value })} />
            <label className="form-field"><span>Tempo com FGTS informado</span><div className="unit-control"><input type="number" min="0" step="0.5" value={form.fgtsTimeYears ?? ""} onChange={(event) => update({ fgtsTimeYears: event.target.value ? Number(event.target.value) : null })} placeholder="—" /><span>anos</span></div><small>Não confirma elegibilidade para uso.</small></label>
            <label className="form-field"><span>Regime trabalhista informado</span><input value={form.employmentRegime ?? ""} onChange={(event) => update({ employmentRegime: event.target.value })} placeholder="Ex.: CLT, autônomo, aposentado" /></label>
            <label className="form-field"><span>3+ anos de carteira?</span><select value={form.threeYearsWorkHistory === undefined || form.threeYearsWorkHistory === null ? "unknown" : form.threeYearsWorkHistory ? "yes" : "no"} onChange={(event) => update({ threeYearsWorkHistory: event.target.value === "unknown" ? null : event.target.value === "yes" })}><option value="unknown">Não informado</option><option value="yes">Sim</option><option value="no">Não</option></select></label>
            <label className="form-field"><span>Região/bairros pretendidos</span><input value={form.preferences?.desiredAreas ?? ""} onChange={(event) => update({ preferences: { desiredAreas: event.target.value, bedrooms: form.preferences?.bedrooms ?? null, parking: form.preferences?.parking ?? null, deliveryYear: form.preferences?.deliveryYear ?? null } })} placeholder="Ex.: Barra / Recreio" /></label>
            <label className="form-field"><span>Quartos pretendidos</span><input type="number" min="0" max="10" value={form.preferences?.bedrooms ?? ""} onChange={(event) => update({ preferences: { desiredAreas: form.preferences?.desiredAreas ?? "", bedrooms: event.target.value ? Number(event.target.value) : null, parking: form.preferences?.parking ?? null, deliveryYear: form.preferences?.deliveryYear ?? null } })} /></label>
            <label className="form-field"><span>Vaga pretendida</span><select value={form.preferences?.parking === undefined || form.preferences?.parking === null ? "unknown" : form.preferences.parking ? "yes" : "no"} onChange={(event) => update({ preferences: { desiredAreas: form.preferences?.desiredAreas ?? "", bedrooms: form.preferences?.bedrooms ?? null, parking: event.target.value === "unknown" ? null : event.target.value === "yes", deliveryYear: form.preferences?.deliveryYear ?? null } })}><option value="unknown">Não informado</option><option value="yes">Com vaga</option><option value="no">Sem vaga</option></select></label>
            <label className="form-field"><span>Ano de entrega pretendido</span><input type="number" min="2026" max="2040" value={form.preferences?.deliveryYear ?? ""} onChange={(event) => update({ preferences: { desiredAreas: form.preferences?.desiredAreas ?? "", bedrooms: form.preferences?.bedrooms ?? null, parking: form.preferences?.parking ?? null, deliveryYear: event.target.value ? Number(event.target.value) : null } })} /></label>
            <section className="client-price-profile span-2" aria-labelledby="client-price-profile-title" onPaste={pastePriceImage}>
              <div className="client-price-profile-heading"><div><span className="eyebrow">DADOS FINANCEIROS INFORMADOS</span><h3 id="client-price-profile-title">PRICE / GPM de referência</h3><p>Guarde a origem, a data, o preço-base e os valores recebidos. A projeção para outra unidade será identificada como estimativa proporcional.</p></div>{form.priceProfile && <button className="text-button danger-text" onClick={() => update({ priceProfile: undefined })}>Limpar PRICE</button>}</div>
              <div className="form-grid profile-price-grid">
                <MoneyInput label="Preço-base da simulação PRICE" value={form.priceProfile?.priceReferenceCents ?? null} onChange={(value) => updatePriceProfile({ priceReferenceCents: value })} hint="Necessário para projetar os valores para outro imóvel." />
                <MoneyInput label="Financiamento estimado informado" value={form.priceProfile?.gpmReportedFinancingAmountCents ?? form.priceProfile?.financingAmountCents ?? null} onChange={(value) => updatePriceProfile({ financingAmountCents: value, gpmReportedFinancingAmountCents: value })} />
                <MoneyInput label="1ª parcela PRICE informada" value={form.priceProfile?.gpmReportedFirstPriceInstallmentCents ?? form.priceProfile?.firstPriceInstallmentCents ?? null} onChange={(value) => updatePriceProfile({ firstPriceInstallmentCents: value, gpmReportedFirstPriceInstallmentCents: value })} />
                <label className="form-field"><span>Prazo informado</span><div className="unit-control"><input type="number" min="1" value={form.priceProfile?.financingTermMonths ?? ""} onChange={(event) => updatePriceProfile({ financingTermMonths: event.target.value ? Number(event.target.value) : null })} placeholder="—" /><span>meses</span></div></label>
                <label className="form-field"><span>Linha / faixa</span><input value={form.priceProfile?.financingLine ?? ""} onChange={(event) => updatePriceProfile({ financingLine: event.target.value })} placeholder="Se constar no GPM" /></label>
                <label className="form-field"><span>Sistema</span><input value={form.priceProfile?.financingSystem ?? "PRICE"} onChange={(event) => updatePriceProfile({ financingSystem: event.target.value })} /></label>
                <label className="form-field"><span>Taxa informada</span><input value={form.priceProfile?.financingRate ?? ""} onChange={(event) => updatePriceProfile({ financingRate: event.target.value })} placeholder="Somente se constar" /></label>
                <label className="form-field"><span>Fonte / documento</span><input value={form.priceProfile?.source ?? ""} onChange={(event) => updatePriceProfile({ source: event.target.value })} placeholder="Ex.: GPM, nome do arquivo" /></label>
                <label className="form-field"><span>Data da PRICE</span><input type="date" value={form.priceProfile?.sourceDate ?? ""} onChange={(event) => updatePriceProfile({ sourceDate: event.target.value })} /></label>
                <label className="form-field span-2"><span>Observações do GPM/PRICE</span><textarea rows={2} value={form.priceProfile?.financingNotes ?? ""} onChange={(event) => updatePriceProfile({ financingNotes: event.target.value })} placeholder="Dados transcritos; não representam aprovação." /></label>
              </div>
              <div className="price-profile-import"><input ref={priceFileRef} type="file" accept="application/pdf,image/*,.pdf" hidden onChange={(event) => void importPriceDocument(event.target.files?.[0])} /><span className="price-profile-import-icon"><FileImage size={18} /></span><div><strong>Preencher a partir de uma imagem ou PDF</strong><small>Extração local no navegador; revise os campos reconhecidos antes de salvar. Você também pode colar uma imagem com Ctrl+V nesta área.</small></div><button type="button" className="button button-quiet button-small" disabled={priceImportBusy} onClick={() => priceFileRef.current?.click()}>{priceImportBusy ? "Lendo…" : <><Upload size={14} /> Importar arquivo</>}</button></div>
              {priceImportNotice && <div className={`inline-status ${priceImportNotice.startsWith("Não") ? "error-status" : ""}`}>{priceImportNotice}</div>}
              <div className="field-note"><Info size={14} /><span>A simulação de origem permanece salva como informada. Recomendações podem estimar valores proporcionais quando o preço-base estiver preenchido; confirme sempre com um GPM/PRICE atualizado. O financiamento projetado é limitado automaticamente a 80% do preço e pode ser editado na simulação.</span></div>
            </section>
            <label className="form-field span-2"><span>Observações / restrições informadas</span><textarea rows={3} value={form.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Ex.: cliente pediu cenário para maio/2029; anotar apenas fatos informados." /></label>
          </div>
          <div className="form-footer"><span className="form-privacy">Dados mantidos neste navegador.</span><div className="form-actions">{selected && <button className="button button-quiet" onClick={() => onSimulate(selected.id)}><CalculatorIcon /> Simular</button>}<button className="button button-primary" disabled={!form.name.trim()} onClick={save}>{savedNotice ? <Check size={16} /> : <Plus size={16} />}{savedNotice ? "Salvo" : "Salvar perfil"}</button></div></div>
          {savedNotice && <div className="inline-status"><Check size={14} /> Perfil atualizado localmente.</div>}
        </section>
      </div>
    </div>
  );
}

function CalculatorIcon() { return <ArrowRight size={15} />; }
