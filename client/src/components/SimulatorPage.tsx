import { useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowDown, ArrowRight, CalendarDays, Check, ChevronDown, ClipboardPaste, Copy, FileText,
  Info, LoaderCircle, Plus, RotateCcw, Save, Send, ShieldCheck, Trash2, Upload, UserPlus, X,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AnnualPayment, ClientPriceProfile, ClientProfile, PaymentDate, SimulationRecord, WorkspaceData } from "../lib/models";
import type { PortfolioUnit } from "../data/portfolio";
import { calculateAll, suggestRobustAct, type FlowScenario, type FullCalculation } from "../lib/calculator";
import { formatBRL, formatNumber } from "../lib/money";
import { recordSimulationDelivery } from "../lib/delivery";
import { createId } from "../lib/storage";
import { countMonthlyPayments, isShortOrImmediateDelivery, listMonthlyDates, monthKey, monthLabelCapitalized, parseMonthKey, suggestAnnualDates } from "../lib/schedule";
import { buildInternalSummary, generateWhatsAppMessage } from "../lib/whatsapp";
import { parseTableFile, type ImportProgress } from "../lib/importFiles";
import { parseGpmText, type GpmSuggestions } from "../lib/gpm";
import { recommendUnitsForLead } from "../lib/leads";
import { clientPriceProfileToSimulation, projectClientPriceProfile } from "../lib/clientPriceProfile";
import CurrencyInput from "./CurrencyInput";
import SearchableUnitSelect from "./SearchableUnitSelect";

interface Props {
  workspace: WorkspaceData;
  setWorkspace: Dispatch<SetStateAction<WorkspaceData>>;
  activeSimulation: SimulationRecord | null;
  setActiveSimulation: Dispatch<SetStateAction<SimulationRecord | null>>;
  onSave: (simulation: SimulationRecord) => void;
  onAddSimulation: (clientId: string, propertyId: string, comparisonGroupId?: string) => void;
  onCreateClient: (client: ClientProfile) => void;
}

const todayMonth = (): PaymentDate => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
const annualId = ({ year, month }: PaymentDate) => `annual-${year}-${String(month).padStart(2, "0")}`;

const recommendationTierDetails = {
  "preferred-region": { title: "1º · Região de interesse", note: "Todas as opções desta região, sem filtro de quartos ou vaga." },
  "preferred-typology": { title: "2º · Tipologia desejada", note: "Fora da região principal, somente a tipologia exata informada." },
  "other-relevant": { title: "Outras preferências", note: "Sem região/quartos definidos; ordenadas pelas demais preferências." },
} as const;

export const makeNewSimulation = (clientId: string, propertyId: string, comparisonGroupId?: string | null): SimulationRecord => ({
  id: createId("sim"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  clientId, propertyId, comparisonGroupId: comparisonGroupId ?? null, priceOverrideCents: null, actDate: todayMonth(), deliveryOverride: null,
  financingAmountCents: null, gpmReportedFinancingAmountCents: null, gpmReportedPriceReferenceCents: null, financingManualOverride: false,
  firstPriceInstallmentCents: null, financingTermMonths: null,
  financingLine: "", financingSystem: "PRICE", financingRate: "", financingNotes: "",
  gpmReportedSubsidyCents: null, gpmReportedFees: "", gpmReportedQuotaPercent: null, gpmReportedIncomeCommitmentPercent: null,
  annualFactor: 3, monthlyCountOverride: null, annualDatesOverride: null,
  robustActCents: null, directPrePercent: 55, directMonthlyCountOverride: null,
  directAnnualDatesOverride: null, manualAmounts: {}, includeDirect: true,
  fgtsUseAuthorized: false, actualShortFlowConfirmed: false, internalNotes: "",
});

const moneyLabel = (cents: number | null | undefined, fallback = "—") => cents === null || cents === undefined ? fallback : formatBRL(cents);
const monthValue = (date: PaymentDate | null): string => date ? monthKey(date) : "";
const parseNullableMonth = (value: string): PaymentDate | null => value ? parseMonthKey(value) : null;
const uniqueSortedDates = (dates: PaymentDate[]): AnnualPayment[] => dates
  .sort((a, b) => a.year - b.year || a.month - b.month)
  .map((date) => ({ ...date, id: annualId(date), amountCents: null }));

interface ComparisonEntry {
  simulation: SimulationRecord;
  unit: PortfolioUnit | null;
  priceCents: number;
  deliveryDate: PaymentDate | null;
  calculation: FullCalculation | null;
}

const calculateComparisonEntry = (simulation: SimulationRecord, workspace: WorkspaceData): ComparisonEntry => {
  const unit = workspace.portfolio.find((item) => item.id === simulation.propertyId) ?? null;
  const client = workspace.clients.find((item) => item.id === simulation.clientId) ?? null;
  const priceCents = simulation.priceOverrideCents ?? unit?.priceCents ?? unit?.priceLowCents ?? 0;
  const deliveryDate = simulation.deliveryOverride ?? (unit?.deliveryYear && unit.deliveryMonth ? { year: unit.deliveryYear, month: unit.deliveryMonth } : null);
  if (!unit) return { simulation, unit, priceCents, deliveryDate, calculation: null };

  const deliveryTextForCalculation = unit.deliveryDateSource ? "" : unit.deliveryText;
  const shortFlow = isShortOrImmediateDelivery(deliveryDate, deliveryTextForCalculation);
  const monthlyCount = shortFlow
    ? simulation.actualShortFlowConfirmed ? simulation.monthlyCountOverride : null
    : simulation.monthlyCountOverride ?? (deliveryDate ? countMonthlyPayments(simulation.actDate, deliveryDate) : null);
  const directMonthlyCount = shortFlow
    ? simulation.actualShortFlowConfirmed ? simulation.directMonthlyCountOverride : null
    : simulation.directMonthlyCountOverride ?? monthlyCount;
  const annualPayments = simulation.annualDatesOverride?.slice() ?? (deliveryDate ? uniqueSortedDates(suggestAnnualDates(simulation.actDate, deliveryDate)) : []);
  const directAnnualPayments = simulation.directAnnualDatesOverride?.slice() ?? annualPayments;
  const robustActCents = simulation.robustActCents ?? suggestRobustAct(priceCents, client?.availableActCents ?? null);
  const calculation = calculateAll({
    priceCents,
    incomeCents: client?.incomeFamilyCents ?? null,
    financingAmountCents: simulation.financingAmountCents,
    financingManualOverride: simulation.financingManualOverride,
    firstPriceInstallmentCents: simulation.firstPriceInstallmentCents,
    actDate: simulation.actDate,
    deliveryDate,
    readyText: deliveryTextForCalculation,
    monthlyCount,
    annualPayments,
    annualFactor: simulation.annualFactor,
    robustActCents,
    availableActCents: client?.availableActCents ?? null,
    caixaManualMonthlyCents: simulation.manualAmounts.caixaMonthlyCents,
    caixaManualAnnualCents: simulation.manualAmounts.caixaAnnualCents,
    directManualMonthlyCents: simulation.manualAmounts.directMonthlyCents,
    directManualAnnualCents: simulation.manualAmounts.directAnnualCents,
    directPrePercent: simulation.directPrePercent,
    directMonthlyCount,
    directAnnualPayments,
    includeDirect: simulation.includeDirect,
    actualShortFlowConfirmed: simulation.actualShortFlowConfirmed,
  });
  return { simulation, unit, priceCents, deliveryDate, calculation };
};

type GpmFieldKey = keyof GpmSuggestions;
type GpmReview = { values: GpmSuggestions; selected: Record<GpmFieldKey, boolean> };

function MoneyField({ label, value, onChange, hint, disabled }: { label: string; value: number | null | undefined; onChange: (value: number | null) => void; hint?: string; disabled?: boolean }) {
  return <label className="form-field"><span>{label}</span><div className={`money-control ${disabled ? "disabled" : ""}`}><span>R$</span><CurrencyInput disabled={disabled} min="0" value={value} onChange={onChange} placeholder="0,00" /></div>{hint && <small>{hint}</small>}</label>;
}

function DateField({ label, value, onChange, hint }: { label: string; value: PaymentDate | null; onChange: (value: PaymentDate | null) => void; hint?: string }) {
  return <label className="form-field"><span>{label}</span><div className="date-control"><CalendarDays size={15} /><input type="month" value={monthValue(value)} onChange={(event) => onChange(parseNullableMonth(event.target.value))} /></div>{hint && <small>{hint}</small>}</label>;
}

function StatBlock({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className={`stat-block ${tone}`}><small>{label}</small><strong>{value}</strong>{sub && <span>{sub}</span>}</div>;
}

function FlowPanel({ title, scenario, target, kind, actDate, expanded = false }: { title: string; scenario: FlowScenario | null; target: number | null; kind: "caixa" | "direta"; actDate: PaymentDate; expanded?: boolean }) {
  const [showCalendar, setShowCalendar] = useState(expanded);
  if (!scenario) return <div className="flow-empty"><AlertCircle size={17} /><strong>{kind === "caixa" ? "Informe a simulação PRICE/GPM" : "Ative a modalidade Tabela Direta"}</strong><p>O fluxo só será calculado com os dados correspondentes.</p></div>;
  const monthDates = scenario.monthlyCount ? listMonthlyDates(actDate, scenario.monthlyCount) : [];
  const balanced = scenario.isBalanced;
  const lastRegularMonth = scenario.monthlyCount && scenario.finalMonthlyCents !== null && scenario.finalMonthlyCents !== scenario.regularMonthlyCents;
  return (
    <div className={`flow-panel ${balanced ? "flow-balanced" : "flow-unbalanced"}`}>
      <div className="flow-panel-head"><div><span className="eyebrow">{kind === "caixa" ? "PAGO À CURY ATÉ AS CHAVES" : "PRÉ-CHAVES · TABELA DIRETA"}</span><h3>{title}</h3></div><span className={`audit-chip ${balanced ? "ok" : "review"}`}>{balanced ? <><Check size={12} /> FECHA</> : <><AlertCircle size={12} /> REVISAR</>}</span></div>
      <div className="flow-amount-row"><span>{kind === "caixa" ? "Recursos próprios alvo" : "Percentual pré-chaves"}</span><strong>{kind === "caixa" ? moneyLabel(target) : `${target ? formatBRL(target) : "—"}`}</strong></div>
      <div className="flow-items">
        <div className="flow-item"><span className="flow-index act-index">A</span><span><strong>Ato</strong><small>{scenario.actPercent !== null ? `${formatNumber(scenario.actPercent, 1)}% do preço total` : "Ato separado das mensais"}</small></span><b>{formatBRL(scenario.actCents)}</b></div>
        <div className="flow-item"><span className="flow-index monthly-index">M</span><span><strong>{scenario.monthlyCount ?? "—"} mensais</strong><small>{scenario.monthlyIncomePercent !== null ? `${formatNumber(scenario.monthlyIncomePercent, 1)}% da renda familiar` : "Percentual de renda a confirmar"}</small></span><b>{moneyLabel(scenario.regularMonthlyCents, "Pendente")}</b></div>
        {scenario.annualPayments.map((annual) => <div className="flow-item" key={annual.id}><span className="flow-index annual-index">I</span><span><strong>Anual · {monthLabelCapitalized(annual)}</strong><small>{scenario.regularMonthlyCents ? `${formatNumber((annual.amountCents ?? 0) / scenario.regularMonthlyCents, 1)}× a mensal` : "Data anterior às chaves"}</small></span><b>{moneyLabel(annual.amountCents, "Pendente")}</b></div>)}
        {lastRegularMonth && <div className="flow-item rounding-row"><span className="flow-index">↳</span><span><strong>Última mensal</strong><small>Ajuste residual de arredondamento informado</small></span><b>{formatBRL(scenario.finalMonthlyCents)}</b></div>}
      </div>
      <div className="flow-total"><span>Total distribuído <small>Diferença vs alvo: {moneyLabel(scenario.differenceCents)}</small></span><strong>{moneyLabel(scenario.scheduledTotalCents)}</strong></div>
      {scenario.timingErrors.length > 0 && <div className="flow-alert danger-alert">{scenario.timingErrors.map((item) => <p key={item}>{item}</p>)}</div>}
      {scenario.warnings.length > 0 && <div className="flow-alert">{scenario.warnings.slice(0, 4).map((item) => <p key={item}>{item}</p>)}</div>}
      {scenario.monthlyCount !== null && scenario.monthlyCount > 0 && <><button className="flow-calendar-toggle" onClick={() => setShowCalendar(!showCalendar)}>{showCalendar ? "Ocultar" : "Ver"} calendário das mensais <ChevronDown size={14} className={showCalendar ? "rotate" : ""} /></button>{showCalendar && <div className="monthly-calendar"><div className="calendar-header"><span>PARCELA</span><span>VENCIMENTO</span><span>VALOR</span></div>{monthDates.map((dueDate, index) => <div className="calendar-row" key={index}><span>{String(index + 1).padStart(2, "0")}</span><span>{monthLabelCapitalized(dueDate)}</span><span>{index === scenario.monthlyCount! - 1 && scenario.finalMonthlyCents !== scenario.regularMonthlyCents ? formatBRL(scenario.finalMonthlyCents) : moneyLabel(scenario.regularMonthlyCents)}</span></div>)}</div>}</>}
    </div>
  );
}

export default function SimulatorPage({ workspace, setWorkspace, activeSimulation, setActiveSimulation, onSave, onAddSimulation, onCreateClient }: Props) {
  const initial = activeSimulation ?? makeNewSimulation("", workspace.portfolio[0]?.id ?? "");
  const [draft, setDraft] = useState<SimulationRecord>(initial);
  const [view, setView] = useState<"interno" | "whatsapp">("interno");
  const [toast, setToast] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientIncome, setNewClientIncome] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const gpmFileRef = useRef<HTMLInputElement>(null);
  const [gpmBusy, setGpmBusy] = useState(false);
  const [gpmProgress, setGpmProgress] = useState<ImportProgress | null>(null);
  const [gpmReview, setGpmReview] = useState<GpmReview | null>(null);
  const [gpmError, setGpmError] = useState("");
  const [gpmNotice, setGpmNotice] = useState("");
  const [gpmSourceName, setGpmSourceName] = useState("Informado manualmente no simulador");
  const [recommendationsExpanded, setRecommendationsExpanded] = useState(false);
  const [nextPropertyId, setNextPropertyId] = useState("");

  // New loaded simulation key starts a fresh draft; edits remain local until the user saves.
  const activeId = activeSimulation?.id ?? "";
  const [lastLoadedId, setLastLoadedId] = useState(activeId);
  if (activeId && activeId !== lastLoadedId) { setDraft(activeSimulation!); setLastLoadedId(activeId); }
  const client = workspace.clients.find((item) => item.id === draft.clientId) ?? null;
  const property = workspace.portfolio.find((item) => item.id === draft.propertyId) ?? workspace.portfolio[0];
  const priceCents = draft.priceOverrideCents ?? property?.priceCents ?? property?.priceLowCents ?? 0;
  const clientRecommendations = useMemo(() => {
    const preferences = client?.preferences;
    if (!client || !preferences || !(
      preferences.desiredAreas.trim() || preferences.bedrooms !== null ||
      preferences.parking !== null || preferences.deliveryYear !== null
    )) return [];
    return recommendUnitsForLead(client, workspace.portfolio).filter((item) => item.reasons.length > 0);
  }, [client, workspace.portfolio]);
  const recommendationTierCounts = useMemo(() => ({
    "preferred-region": clientRecommendations.filter((item) => item.tier === "preferred-region").length,
    "preferred-typology": clientRecommendations.filter((item) => item.tier === "preferred-typology").length,
    "other-relevant": clientRecommendations.filter((item) => item.tier === "other-relevant").length,
  }), [clientRecommendations]);
  const hasPriceProfileData = [draft.financingAmountCents, draft.gpmReportedFinancingAmountCents, draft.firstPriceInstallmentCents, draft.financingTermMonths,
    draft.gpmReportedSubsidyCents, draft.gpmReportedQuotaPercent, draft.gpmReportedIncomeCommitmentPercent]
    .some((value) => value !== null && value !== undefined) || Boolean(
      draft.financingLine.trim() || draft.financingRate.trim() || draft.gpmReportedFees?.trim() || draft.financingNotes.trim(),
    );
  const deliveryDate = draft.deliveryOverride ?? (property?.deliveryMonth && property?.deliveryYear ? { year: property.deliveryYear, month: property.deliveryMonth } : null);
  const deliveryText = property?.deliveryText ?? "Prazo de entrega não informado";
  const actDate = draft.actDate;
  const familyIncome = client?.incomeFamilyCents ?? null;
  const availableAct = client?.availableActCents ?? null;
  const readyText = property?.deliveryDateSource ? "" : property?.deliveryText ?? "";
  const shortFlow = isShortOrImmediateDelivery(deliveryDate, readyText);
  const dueDates = useMemo(() => {
    if (draft.annualDatesOverride) return draft.annualDatesOverride;
    return deliveryDate ? uniqueSortedDates(suggestAnnualDates(actDate, deliveryDate)) : [];
  }, [draft.annualDatesOverride, deliveryDate?.year, deliveryDate?.month, actDate.year, actDate.month]);
  const directDates = draft.directAnnualDatesOverride ?? dueDates;
  const maxMonths = deliveryDate ? countMonthlyPayments(actDate, deliveryDate) : null;
  const monthlyCount = shortFlow ? (draft.actualShortFlowConfirmed ? draft.monthlyCountOverride : null) : draft.monthlyCountOverride ?? maxMonths;
  const directMonthlyCount = shortFlow ? (draft.actualShortFlowConfirmed ? draft.directMonthlyCountOverride : null) : draft.directMonthlyCountOverride ?? monthlyCount;
  const robustAct = draft.robustActCents ?? suggestRobustAct(priceCents, availableAct);
  const calculation = useMemo(() => calculateAll({
    priceCents,
    incomeCents: familyIncome,
    financingAmountCents: draft.financingAmountCents,
    financingManualOverride: draft.financingManualOverride,
    firstPriceInstallmentCents: draft.firstPriceInstallmentCents,
    actDate,
    deliveryDate,
    readyText,
    monthlyCount,
    annualPayments: dueDates,
    annualFactor: draft.annualFactor,
    robustActCents: robustAct,
    availableActCents: availableAct,
    caixaManualMonthlyCents: draft.manualAmounts.caixaMonthlyCents,
    caixaManualAnnualCents: draft.manualAmounts.caixaAnnualCents,
    directManualMonthlyCents: draft.manualAmounts.directMonthlyCents,
    directManualAnnualCents: draft.manualAmounts.directAnnualCents,
    directPrePercent: draft.directPrePercent,
    directMonthlyCount,
    directAnnualPayments: directDates,
    includeDirect: draft.includeDirect,
    actualShortFlowConfirmed: draft.actualShortFlowConfirmed,
  }), [priceCents, familyIncome, draft, actDate.year, actDate.month, deliveryDate?.year, deliveryDate?.month, readyText, monthlyCount, dueDates, robustAct, availableAct, directMonthlyCount, directDates]);
  const deliveryIsPremise = draft.deliveryOverride !== null || Boolean(property?.deliveryDateSource) || Boolean(property?.deliveryYear && !property.deliveryMonth);
  const priceIsPremise = draft.priceOverrideCents !== null || (!property?.priceCents && property?.priceLowCents !== undefined);
  const messageContext = useMemo(() => property ? ({
    client, property, priceCents, deliveryDate, deliveryText, monthsCount: monthlyCount, calculation,
    deliveryIsPremise, priceIsPremise, actDate,
    financingTermMonths: draft.financingTermMonths, financingLine: draft.financingLine,
    financingSystem: draft.financingSystem, financingRate: draft.financingRate, firstPriceInstallmentCents: draft.firstPriceInstallmentCents,
    gpmReportedSubsidyCents: draft.gpmReportedSubsidyCents, gpmReportedFees: draft.gpmReportedFees,
    gpmReportedQuotaPercent: draft.gpmReportedQuotaPercent, gpmReportedIncomeCommitmentPercent: draft.gpmReportedIncomeCommitmentPercent,
    incomeCents: familyIncome, includeFGTSNote: (client?.fgtsBalanceCents ?? 0) > 0,
    mode: "ambas" as const,
  }) : null, [client, property, priceCents, deliveryDate?.year, deliveryDate?.month, deliveryText, monthlyCount, calculation, deliveryIsPremise, priceIsPremise, draft.financingTermMonths, draft.financingLine, draft.financingSystem, draft.financingRate, draft.firstPriceInstallmentCents, draft.gpmReportedSubsidyCents, draft.gpmReportedFees, draft.gpmReportedQuotaPercent, draft.gpmReportedIncomeCommitmentPercent, familyIncome]);
  const message = messageContext ? generateWhatsAppMessage(messageContext) : "Selecione uma unidade para montar a mensagem.";
  const internalSummary = messageContext ? buildInternalSummary(messageContext) : "Selecione uma unidade para conferir os dados.";

  const update = (patch: Partial<SimulationRecord>) => {
    const next = { ...draft, ...patch, updatedAt: new Date().toISOString() };
    setDraft(next);
    setActiveSimulation(next);
    setNotice("");
  };
  const changeClient = (clientId: string) => {
    const selectedClient = workspace.clients.find((item) => item.id === clientId);
    update({
      clientId,
      ...clientPriceProfileToSimulation(selectedClient?.priceProfile, priceCents),
      manualAmounts: {}, robustActCents: null, monthlyCountOverride: null, annualDatesOverride: null,
      directMonthlyCountOverride: null, directAnnualDatesOverride: null, actualShortFlowConfirmed: false,
    });
    setGpmSourceName(selectedClient?.priceProfile?.source || "Informado manualmente no simulador");
    setGpmReview(null);
    setGpmNotice(selectedClient?.priceProfile
      ? `PRICE carregada do perfil; os campos são editáveis. ${projectClientPriceProfile(selectedClient.priceProfile, priceCents).message}`
      : "Este cliente não tem PRICE/GPM salvo; os campos financeiros foram limpos para evitar mistura com o perfil anterior.");
  };
  const importGpmFile = async (file?: File) => {
    if (!file) return;
    setGpmSourceName(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      ? "Arquivo PDF importado e revisado no simulador"
      : "Imagem importada e revisada no simulador");
    setGpmBusy(true); setGpmError(""); setGpmNotice(""); setGpmReview(null);
    try {
      const parsed = await parseTableFile(file, true, setGpmProgress);
      const values = parseGpmText(parsed.rawText);
      if (!Object.values(values).some((value) => value !== null)) {
        setGpmError("Não identifiquei campos GPM/PRICE com segurança. Digite os dados manualmente ou tente um arquivo mais nítido.");
      } else {
        const keys = Object.keys(values) as GpmFieldKey[];
        const selected = Object.fromEntries(keys.map((key) => [key, values[key] !== null])) as Record<GpmFieldKey, boolean>;
        setGpmReview({ values, selected });
        setGpmNotice("Extração local concluída. Revise e corrija os campos abaixo; o arquivo e o texto bruto não são salvos.");
      }
    } catch (error) {
      setGpmError(error instanceof Error ? error.message : "Não foi possível ler esse arquivo.");
    } finally {
      setGpmBusy(false); setGpmProgress(null);
      if (gpmFileRef.current) gpmFileRef.current.value = "";
    }
  };
  const pasteGpmImage = (event: React.ClipboardEvent<HTMLElement>) => {
    const item = [...event.clipboardData.items].find((entry) => entry.type.startsWith("image/"));
    const image = item?.getAsFile();
    if (image) { event.preventDefault(); void importGpmFile(new File([image], "imagem-colada.png", { type: image.type || "image/png" })); }
  };
  const updateGpmValue = <K extends GpmFieldKey>(key: K, value: GpmSuggestions[K]) => {
    setGpmReview((current) => current ? { ...current, values: { ...current.values, [key]: value } } : current);
  };
  const toggleGpmField = (key: GpmFieldKey, checked: boolean) => {
    setGpmReview((current) => current ? { ...current, selected: { ...current.selected, [key]: checked } } : current);
  };
  const applyGpmReview = () => {
    if (!gpmReview) return;
    const { values, selected } = gpmReview;
    const patch: Partial<SimulationRecord> = {};
    if (selected.propertyPriceCents && values.propertyPriceCents !== null) patch.priceOverrideCents = values.propertyPriceCents;
    let cappedFromGpm = false;
    if (selected.financingAmountCents && values.financingAmountCents !== null) {
      const sourcePrice = selected.propertyPriceCents && values.propertyPriceCents !== null ? values.propertyPriceCents : priceCents;
      const cap = sourcePrice > 0 ? Math.floor(sourcePrice * 0.8) : null;
      cappedFromGpm = cap !== null && values.financingAmountCents > cap;
      patch.financingAmountCents = cappedFromGpm ? cap : values.financingAmountCents;
      patch.financingManualOverride = false;
      patch.gpmReportedFinancingAmountCents = values.financingAmountCents;
      patch.gpmReportedPriceReferenceCents = sourcePrice > 0 ? sourcePrice : null;
    }
    if (selected.firstInstallmentCents && values.firstInstallmentCents !== null) {
      patch.firstPriceInstallmentCents = values.firstInstallmentCents;
      patch.gpmReportedFirstPriceInstallmentCents = values.firstInstallmentCents;
      const sourcePrice = selected.propertyPriceCents && values.propertyPriceCents !== null ? values.propertyPriceCents : priceCents;
      if (sourcePrice > 0) patch.gpmReportedPriceReferenceCents ??= sourcePrice;
    }
    if (selected.termMonths && values.termMonths !== null) patch.financingTermMonths = values.termMonths;
    if (selected.financingLine && values.financingLine !== null) patch.financingLine = values.financingLine;
    if (selected.financingSystem && values.financingSystem !== null) patch.financingSystem = values.financingSystem;
    if (selected.rate && values.rate !== null) patch.financingRate = values.rate;
    if (selected.subsidyCents && values.subsidyCents !== null) patch.gpmReportedSubsidyCents = values.subsidyCents;
    if (selected.fees && values.fees !== null) patch.gpmReportedFees = values.fees;
    if (selected.quotaPercent && values.quotaPercent !== null) patch.gpmReportedQuotaPercent = values.quotaPercent;
    if (selected.incomeCommitmentPercent && values.incomeCommitmentPercent !== null) patch.gpmReportedIncomeCommitmentPercent = values.incomeCommitmentPercent;
    const applyIncome = selected.familyIncomeCents && values.familyIncomeCents !== null && Boolean(client);
    if (Object.keys(patch).length === 0 && !applyIncome) {
      setGpmError(client || !selected.familyIncomeCents ? "Marque ao menos um campo reconhecido para aplicar." : "Selecione um cliente no simulador antes de aplicar a renda reconhecida.");
      return;
    }
    if (Object.keys(patch).length) update(patch);
    if (applyIncome && client) {
      setWorkspace((current) => ({ ...current, clients: current.clients.map((item) => item.id === client.id ? { ...item, incomeFamilyCents: values.familyIncomeCents, updatedAt: new Date().toISOString() } : item) }));
    }
    const skippedIncome = selected.familyIncomeCents && values.familyIncomeCents !== null && !client;
    setGpmError("");
    setGpmNotice(`Campos revisados aplicados à simulação${cappedFromGpm ? `; financiamento ajustado automaticamente de ${formatBRL(values.financingAmountCents!)} para o teto indicativo de 80% (${formatBRL(patch.financingAmountCents!)}).` : ""}${skippedIncome ? "; renda não aplicada porque nenhum cliente está selecionado" : ""}. Você pode editar o valor manualmente; salve a simulação para persistir.`);
    setGpmReview(null);
  };
  const savePriceProfileToClient = () => {
    if (!client || priceCents <= 0 || !hasPriceProfileData) {
      setNotice("Selecione um cliente, informe o preço-base e preencha ao menos um dado GPM/PRICE antes de salvar no perfil.");
      return;
    }
    const updatedAt = new Date().toISOString();
    const source = gpmSourceName.trim() || "Informado manualmente no simulador";
    const existingProfile = client.priceProfile;
    const priceProfile: ClientPriceProfile = {
      priceReferenceCents: draft.gpmReportedPriceReferenceCents ?? priceCents,
      financingAmountCents: draft.gpmReportedFinancingAmountCents ?? draft.financingAmountCents,
      gpmReportedFinancingAmountCents: draft.gpmReportedFinancingAmountCents ?? draft.financingAmountCents,
      firstPriceInstallmentCents: draft.gpmReportedFirstPriceInstallmentCents ?? draft.firstPriceInstallmentCents,
      gpmReportedFirstPriceInstallmentCents: draft.gpmReportedFirstPriceInstallmentCents ?? draft.firstPriceInstallmentCents,
      financingTermMonths: draft.financingTermMonths,
      financingLine: draft.financingLine,
      financingSystem: draft.financingSystem,
      financingRate: draft.financingRate,
      financingNotes: draft.financingNotes,
      source,
      sourceDate: existingProfile?.source === source ? existingProfile.sourceDate ?? "" : "",
      gpmReportedSubsidyCents: draft.gpmReportedSubsidyCents,
      gpmReportedFees: draft.gpmReportedFees ?? "",
      gpmReportedQuotaPercent: draft.gpmReportedQuotaPercent ?? null,
      gpmReportedIncomeCommitmentPercent: draft.gpmReportedIncomeCommitmentPercent ?? null,
      updatedAt,
    };
    setWorkspace((current) => ({
      ...current,
      clients: current.clients.map((item) => item.id === client.id ? { ...item, priceProfile, updatedAt } : item),
    }));
    setGpmNotice(`PRICE/GPM salva no perfil de ${client.name}. Base: ${formatBRL(priceCents)}; origem: ${priceProfile.source}. A data da tabela não foi presumida.`);
    setNotice("Dados PRICE/GPM salvos no perfil do cliente e disponíveis nas próximas recomendações.");
  };
  const openRecommendedScenario = (unit: PortfolioUnit) => {
    if (!client) return;
    const recommendation = clientRecommendations.find((item) => item.unit.id === unit.id);
    if (!recommendation) return;
    const previousRecord = workspace.simulations.find((item) => item.id === draft.id);
    const serializeWithoutTimestamp = (record: SimulationRecord) => JSON.stringify({ ...record, updatedAt: "" });
    const hasUnpersistedWork = draft.financingAmountCents !== null || draft.firstPriceInstallmentCents !== null ||
      draft.deliveryOverride !== null || draft.priceOverrideCents !== null || Object.keys(draft.manualAmounts).length > 0;
    const changedExistingRecord = previousRecord && serializeWithoutTimestamp(previousRecord) !== serializeWithoutTimestamp(draft);
    const preserveDraft = changedExistingRecord || (!previousRecord && hasUnpersistedWork);
    if (preserveDraft && property && priceCents > 0) onSave({ ...draft, updatedAt: new Date().toISOString() });
    const comparisonGroupId = draft.comparisonGroupId ?? createId("compare");
    const targetPrice = unit.priceCents ?? unit.priceLowCents ?? null;
    const projection = projectClientPriceProfile(client.priceProfile, targetPrice);
    const next: SimulationRecord = {
      ...makeNewSimulation(client.id, unit.id, comparisonGroupId),
      ...clientPriceProfileToSimulation(client.priceProfile, targetPrice),
      origin: "lead_recommendation",
      recommendation: { score: recommendation.score, reasons: recommendation.reasons, mismatches: recommendation.mismatches },
      internalNotes: projection.message,
    };
    setDraft(next);
    setActiveSimulation(next);
    setLastLoadedId(next.id);
    setGpmSourceName(client.priceProfile?.source || "PRICE/GPM pendente no perfil");
    setGpmReview(null);
    setGpmNotice(client.priceProfile ? projection.message : "PRICE/GPM pendente no perfil; os campos financeiros foram deixados vazios.");
    setNotice(`Cenário independente aberto para ${unit.project} · ${unit.typology}.${preserveDraft ? " O rascunho anterior com alterações foi salvo localmente para não perder seus dados." : " Revise preço e premissas antes de salvar."}`);
  };
  const setAnnualDates = (kind: "caixa" | "directa", rows: AnnualPayment[]) => {
    if (kind === "caixa") update({ annualDatesOverride: rows });
    else update({ directAnnualDatesOverride: rows });
  };
  const addAnnual = (kind: "caixa" | "directa") => {
    const rows = kind === "caixa" ? dueDates : directDates;
    let nextYear = Math.max(2027, actDate.year, ...rows.map((row) => row.year + 1));
    if (nextYear === actDate.year && actDate.month >= 12) nextYear += 1;
    const due = { year: nextYear, month: 12, id: annualId({ year: nextYear, month: 12 }), amountCents: null };
    setAnnualDates(kind, [...rows, due]);
  };
  const updateAnnualDate = (kind: "caixa" | "directa", oldId: string, date: PaymentDate | null) => {
    const rows = kind === "caixa" ? dueDates : directDates;
    if (!date) return;
    setAnnualDates(kind, rows.map((row) => row.id === oldId ? { ...date, id: annualId(date), amountCents: null } : row));
  };
  const setManualMonthly = (kind: "caixa" | "directa", value: number | null) => {
    update({ manualAmounts: { ...draft.manualAmounts, [kind === "caixa" ? "caixaMonthlyCents" : "directMonthlyCents"]: value ?? undefined } });
  };
  const setManualAnnual = (kind: "caixa" | "directa", rowId: string, value: number | null) => {
    const scenario = kind === "caixa" ? calculation.robust : calculation.directRobust;
    const monthlyKey = kind === "caixa" ? "caixaMonthlyCents" : "directMonthlyCents";
    const annualKey = kind === "caixa" ? "caixaAnnualCents" : "directAnnualCents";
    const manualAnnuals = { ...(draft.manualAmounts[annualKey] ?? {}), [rowId]: value ?? 0 };
    update({ manualAmounts: { ...draft.manualAmounts, [monthlyKey]: draft.manualAmounts[monthlyKey] ?? scenario?.regularMonthlyCents ?? 0, [annualKey]: manualAnnuals } });
  };
  const resetAuto = () => { update({ manualAmounts: {}, monthlyCountOverride: null, annualDatesOverride: null, directMonthlyCountOverride: null, directAnnualDatesOverride: null }); setNotice("Cálculo automático restaurado. Ato e percentuais foram mantidos."); };
  const save = () => {
    if (!property || priceCents <= 0) { setNotice("Selecione uma unidade com preço ou informe um valor para esta simulação."); return; }
    const record = { ...draft, propertyId: property.id, priceOverrideCents: draft.priceOverrideCents, updatedAt: new Date().toISOString() };
    if (draft.deliveryOverride) {
      const { year, month } = draft.deliveryOverride;
      setWorkspace((current) => ({ ...current, portfolio: current.portfolio.map((unit) => unit.id === property.id ? recordSimulationDelivery(unit, { year, month }) : unit) }));
    }
    onSave(record); setNotice("Simulação salva neste dispositivo.");
  };
  const addScenario = () => {
    const nextProperty = workspace.portfolio.find((unit) => unit.id === nextPropertyId) ?? workspace.portfolio[0];
    if (!property || priceCents <= 0) { setNotice("Informe o preço desta unidade e salve antes de acrescentar outro cenário."); return; }
    if (!nextProperty) { setNotice("Cadastre um empreendimento no catálogo antes de adicionar outro cenário."); return; }
    const comparisonGroupId = draft.comparisonGroupId ?? createId("compare");
    const record = { ...draft, propertyId: property.id, comparisonGroupId, updatedAt: new Date().toISOString() };
    if (draft.deliveryOverride) {
      const { year, month } = draft.deliveryOverride;
      setWorkspace((current) => ({ ...current, portfolio: current.portfolio.map((unit) => unit.id === property.id ? recordSimulationDelivery(unit, { year, month }) : unit) }));
    }
    onSave(record);
    onAddSimulation(draft.clientId, nextProperty.id, comparisonGroupId);
  };
  const createQuickClient = () => {
    if (!newClientName.trim()) return;
    const next: ClientProfile = {
      id: createId("client"), name: newClientName.trim(), phone: "", incomeIndividualCents: null,
      incomeFamilyCents: newClientIncome, incomeComposition: "", oldestBuyerAge: null,
      availableActCents: null, monthlyCapacityCents: null, annualCapacityCents: null, desiredTermMonths: null,
      fgtsBalanceCents: null, fgtsTimeYears: null, notes: "", updatedAt: new Date().toISOString(),
    };
    onCreateClient(next); update({ clientId: next.id }); setNewClientOpen(false); setNewClientName(""); setNewClientIncome(null);
  };
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(message); setToast("Mensagem copiada para a área de transferência."); }
    catch { setToast("Não foi possível copiar automaticamente. Selecione e copie o texto abaixo."); }
    window.setTimeout(() => setToast(""), 3500);
  };
  const openWhatsApp = () => {
    const phone = client?.phone.replace(/\D/g, "") ?? "";
    const normalized = phone ? (phone.startsWith("55") ? phone : `55${phone}`) : "";
    const url = normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const modeCanCopy = calculation.robust?.isBalanced ?? false;
  const estimatedPriceRange = !property?.priceCents && property?.priceLowCents !== undefined;
  const comparisonRecords = [
    ...(draft.comparisonGroupId ? workspace.simulations.filter((item) => item.comparisonGroupId === draft.comparisonGroupId && item.id !== draft.id) : []),
    draft,
  ];
  const comparisonEntries = comparisonRecords.map((item) => calculateComparisonEntry(item, workspace));
  const minimumAmong = (pick: (entry: ComparisonEntry) => number | null | undefined): number | null => {
    const values = comparisonEntries.map(pick).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
    return values.length ? Math.min(...values) : null;
  };
  const lowestRobustAct = minimumAmong((entry) => entry.calculation?.robust?.actCents);
  const lowestMinimumAct = minimumAmong((entry) => entry.calculation?.minimumActCents);
  const lowestDirectRobustAct = minimumAmong((entry) => entry.calculation?.directRobust?.actCents);
  const lowestDirectMinimumAct = minimumAmong((entry) => entry.calculation?.directMinimum?.actCents);
  const lowestCaixaMonthly = minimumAmong((entry) => entry.calculation?.robust?.regularMonthlyCents);
  const lowestPriceFirstInstallment = minimumAmong((entry) => entry.simulation.firstPriceInstallmentCents);
  const lowestDirectMonthly = minimumAmong((entry) => entry.calculation?.directRobust?.regularMonthlyCents);
  const isLowest = (value: number | null | undefined, floor: number | null) => value !== null && value !== undefined && floor !== null && value === floor;

  if (!property) return <div className="panel empty-state"><strong>O catálogo está vazio.</strong><p>Cadastre uma unidade antes de simular.</p></div>;

  return (
    <div className="page-stack simulator-page">
      <div className="page-heading simulator-heading"><div><div className="eyebrow">MOTOR DE FLUXO <span className="eyebrow-dot" /> SIMULAÇÃO EDITÁVEL</div><h1>Uma proposta. Cada parcela conferida.</h1><p>Dados bancários vêm da simulação GPM/PRICE que você informar. Nenhum valor é estimado sem sinalização.</p></div><button className="button button-primary" onClick={save}><Save size={16} /> Salvar simulação</button></div>
      {draft.origin === "lead_recommendation" && <div className="reference-alert"><Info size={17} /><div><strong>Rascunho recomendado pelas preferências do lead.</strong><p>{draft.recommendation?.reasons.join(" ")} A indicação não inclui GPM/PRICE, avaliação de crédito ou disponibilidade. Revise a tabela e preencha os dados financeiros antes de apresentar.</p></div></div>}
      {notice && <div className="reference-alert"><Info size={17} /><div><strong>Atenção à entrega / simulação</strong><p>{notice}</p></div><button className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={15} /></button></div>}
      <div className="simulator-topline"><div className="topline-price"><small>PREÇO DA UNIDADE</small><strong>{priceCents > 0 ? formatBRL(priceCents) : "A informar"}</strong><span>{property.project} · {property.typology}</span></div><div className="topline-stats"><StatBlock label="REGIÃO" value={property.neighborhood || property.region} sub={property.region} /><StatBlock label="ENTREGA INDICADA" value={deliveryDate ? monthLabelCapitalized(deliveryDate) : property.deliveryText} sub={deliveryDate ? `${monthlyCount ?? "—"} mensais possíveis antes das chaves` : "Mês/ano a confirmar"} /><StatBlock label="FONTE" value={property.source.startsWith("Prompt") ? "Referência nov/26" : property.source} sub="Confirme tabela e unidade" /></div></div>
      {estimatedPriceRange && <div className="reference-alert"><Info size={17} /><div><strong>Preço informado como faixa.</strong><p>Para esta prévia foi selecionado o menor valor da faixa ({formatBRL(property.priceLowCents)}). Confirme a unidade/andar ou altere o preço no campo abaixo; a premissa ficará visível na conferência.</p></div></div>}
      <div className="simulator-layout">
        <div className="simulator-controls">
          <section className="panel sim-section">
            <div className="sim-section-title"><span className="section-number">01</span><div><h2>Cliente e unidade</h2><p>Defina o perfil e a base de preço da proposta.</p></div></div>
            <div className="form-grid">
              {client && <div className="field-note span-2 client-simulation-summary"><Info size={14} /><span><strong>{client.name}</strong> · renda familiar {moneyLabel(client.incomeFamilyCents, "não informada")} · idade {client.oldestBuyerAge ? `${client.oldestBuyerAge} anos` : "não informada"}</span></div>}
              <label className="form-field span-2"><span>Perfil do cliente</span><div className="select-with-action"><select value={draft.clientId} onChange={(e) => changeClient(e.target.value)}><option value="">Selecione ou deixe sem perfil</option>{workspace.clients.map((item) => <option value={item.id} key={item.id}>{item.name}{item.incomeFamilyCents ? ` · ${formatBRL(item.incomeFamilyCents)}/mês` : ""}</option>)}</select><button className="icon-button add-inline" title="Cadastrar perfil rápido" onClick={() => setNewClientOpen(true)}><UserPlus size={16} /></button></div></label>
              <SearchableUnitSelect className="span-2" label="Empreendimento / unidade" units={workspace.portfolio} value={property.id} onChange={(propertyId) => { const selected = workspace.portfolio.find((unit) => unit.id === propertyId); const nextPrice = selected?.priceCents ?? selected?.priceLowCents ?? null; update({ propertyId, priceOverrideCents: null, deliveryOverride: null, ...clientPriceProfileToSimulation(client?.priceProfile, nextPrice), manualAmounts: {}, robustActCents: null, monthlyCountOverride: null, annualDatesOverride: null, directMonthlyCountOverride: null, directAnnualDatesOverride: null, actualShortFlowConfirmed: false }); setGpmSourceName(client?.priceProfile?.source || "Informado manualmente no simulador"); setGpmReview(null); setGpmNotice(client?.priceProfile ? projectClientPriceProfile(client.priceProfile, nextPrice).message : "PRICE/GPM pendente para esta unidade."); if (selected && (!selected.deliveryYear || !selected.deliveryMonth)) setNotice(`Entrega incompleta para ${selected.project}: ${selected.deliveryText || "mês/ano não informado"}. Informe a premissa antes de calcular o prazo.`); }} />
              {client && <div className="sim-recommendations span-2" aria-live="polite"><button className="sim-recommendations-toggle" aria-expanded={recommendationsExpanded} onClick={() => setRecommendationsExpanded((open) => !open)}><span><span className="eyebrow">RECOMENDAÇÕES PARA ESTE PERFIL</span><strong>Opções compatíveis do catálogo</strong><small>Prioridade: região desejada, tipologia e proximidade da entrega.</small></span><span className="sim-recommendation-count">{clientRecommendations.length} opções <ChevronDown size={16} className={recommendationsExpanded ? "rotate" : ""} /></span></button>{recommendationsExpanded && <div className="sim-recommendations-content"><div className="sim-recommendations-heading"><div><p>Abra uma opção para criar um cenário independente.</p></div></div>
                {!client.preferences || !(client.preferences.desiredAreas.trim() || client.preferences.bedrooms !== null || client.preferences.parking !== null || client.preferences.deliveryYear !== null)
                  ? <div className="sim-recommendations-empty">Cadastre preferências de região, quartos, vaga ou ano de entrega no perfil para gerar recomendações.</div>
                  : clientRecommendations.length === 0
                    ? <div className="sim-recommendations-empty">Nenhuma unidade ativa do catálogo corresponde às preferências informadas. Revise as preferências ou o catálogo.</div>
                    : <div className="sim-recommendation-groups">{clientRecommendations.map((recommendation, index) => {
                      const unit = recommendation.unit;
                      const firstInTier = index === 0 || clientRecommendations[index - 1]?.tier !== recommendation.tier;
                      const tierDetails = recommendationTierDetails[recommendation.tier];
                      const targetPrice = unit.priceCents ?? unit.priceLowCents ?? null;
                      const projection = projectClientPriceProfile(client.priceProfile, targetPrice);
                      const priceText = targetPrice !== null ? formatBRL(targetPrice) : "Preço a informar";
                      const priceDetails = !client.priceProfile
                        ? "PRICE/GPM pendente"
                        : projection.financingAmountCents !== null
                          ? `PRICE proporcional ${formatBRL(projection.financingAmountCents)}${projection.firstPriceInstallmentCents !== null ? ` · 1ª PRICE proporcional ${formatBRL(projection.firstPriceInstallmentCents)}` : ""}${projection.financingCapped ? " · teto de 80% aplicado" : ""}`
                          : `PRICE salva; valores a confirmar. ${projection.message}`;
                      return <div className="sim-recommendation-entry" key={unit.id}>
                        {firstInTier && <div className="sim-recommendation-tier-heading"><div><strong>{tierDetails.title}</strong><small>{tierDetails.note}</small></div><span>{recommendationTierCounts[recommendation.tier]} opção(ões)</span></div>}
                        <article className="sim-recommendation-card">
                        <div className="sim-recommendation-copy"><div className="sim-recommendation-meta"><span className="sim-recommendation-rank">{String(index + 1).padStart(2, "0")}</span><span>{unit.region}</span><span>{unit.deliveryYear ? unit.deliveryMonth ? `${String(unit.deliveryMonth).padStart(2, "0")}/${unit.deliveryYear}` : `${unit.deliveryYear} · mês pendente` : "Entrega a confirmar"}</span></div><h4>{unit.project}</h4><p>{unit.neighborhood || unit.region} · {unit.typology}{unit.parking === "unknown" ? " · vaga a confirmar" : unit.parking ? " · com vaga" : " · sem vaga informada"}</p><small>{recommendation.reasons.slice(0, 2).join(" ") || recommendation.mismatches.slice(0, 1).join(" ")}</small></div>
                        <div className="sim-recommendation-price"><strong>{priceText}</strong><span>{priceDetails}</span></div>
                        <button className="button button-quiet button-small" onClick={() => openRecommendedScenario(unit)}>Abrir cenário <ArrowRight size={14} /></button>
                        </article>
                      </div>;
                    })}</div>}</div>}
              </div>}
              <MoneyField label="Preço adotado nesta simulação" value={priceCents || null} onChange={(value) => { const nextPrice = value ?? property?.priceCents ?? property?.priceLowCents ?? 0; const cap = Math.floor(nextPrice * 0.8); const autoCap = nextPrice > 0 && draft.financingAmountCents !== null && draft.financingAmountCents > cap; update({ priceOverrideCents: value, ...(autoCap ? { financingAmountCents: cap, financingManualOverride: false, gpmReportedFinancingAmountCents: draft.gpmReportedFinancingAmountCents ?? draft.financingAmountCents, gpmReportedPriceReferenceCents: draft.gpmReportedPriceReferenceCents ?? priceCents } : {}) }); if (autoCap) setGpmNotice(`Preço alterado; financiamento ajustado automaticamente de ${formatBRL(draft.financingAmountCents!)} para o novo teto de 80% (${formatBRL(cap)}). O valor GPM original permanece preservado para conferência.`); }} hint="O preço pode ser alterado sem mudar o cadastro do catálogo; financiamento importado/projetado é limitado a 80%." />
              <MoneyField label="Renda familiar mensal" value={familyIncome} onChange={(value) => { if (client) setWorkspace((current) => ({ ...current, clients: current.clients.map((item) => item.id === client.id ? { ...item, incomeFamilyCents: value, updatedAt: new Date().toISOString() } : item) })); }} hint="Editar aqui também atualiza o perfil do cliente." />
              <MoneyField label="Ato disponível informado" value={availableAct} onChange={(value) => { if (client) setWorkspace((current) => ({ ...current, clients: current.clients.map((item) => item.id === client.id ? { ...item, availableActCents: value, updatedAt: new Date().toISOString() } : item) })); }} />
              <label className="form-field"><span>Simulação iniciada em (ato)</span><div className="date-control"><CalendarDays size={15} /><input type="month" value={monthKey(actDate)} onChange={(event) => { const date = parseMonthKey(event.target.value); if (date) update({ actDate: date, annualDatesOverride: null, directAnnualDatesOverride: null }); }} /></div></label>
              <DateField label="Entrega / chaves" value={deliveryDate} onChange={(value) => { update({ deliveryOverride: value, annualDatesOverride: null, directAnnualDatesOverride: null, monthlyCountOverride: null, directMonthlyCountOverride: null }); if (value) setWorkspace((current) => ({ ...current, portfolio: current.portfolio.map((unit) => unit.id === property.id ? recordSimulationDelivery(unit, value) : unit) })); }} hint={deliveryDate ? "Ajuste se o mês da tabela estiver pendente; datas vindas do simulador ficam marcadas como premissa." : "O catálogo só informou o ano ou não trouxe a data. Escolha um mês apenas como premissa explícita."} />
              <div className="field-note span-2"><Info size={14} /><span>{client?.incomeComposition ? `Composição informada: ${client.incomeComposition}. ` : ""}{property.deliveryDateSource === "simulation" ? `Data salva a partir do simulador como premissa; confirme com a fonte oficial. Texto original: ${property.deliveryText}` : property.deliveryDateSource === "manual" ? `Data informada manualmente no catálogo; confirme com a fonte oficial. Texto original: ${property.deliveryText}` : property.deliveryMonth ? "Mês de entrega veio da referência do catálogo." : property.deliveryYear ? `A fonte informa apenas ${property.deliveryYear}; o mês ainda depende de confirmação.` : "Confirme o cronograma oficial antes de apresentar datas."}</span></div>
            </div>
          </section>

          <section className="panel sim-section">
              <div className="sim-section-title"><span className="section-number">02</span><div><h2>Caixa · GPM / PRICE</h2><p>Transcreva a simulação bancária; o site não calcula aprovação.</p></div><input ref={gpmFileRef} type="file" accept="application/pdf,image/*,.pdf" hidden onChange={(event) => void importGpmFile(event.target.files?.[0])} /><div className="sim-section-actions"><button className="button button-quiet button-small" disabled={!client || priceCents <= 0 || !hasPriceProfileData || gpmReview !== null} title={!client ? "Selecione um cliente primeiro" : gpmReview ? "Aplique ou descarte a revisão OCR primeiro" : "Salva os dados atuais no perfil do cliente"} onClick={savePriceProfileToClient}><Save size={14} /> Salvar PRICE no perfil</button><button className="button button-quiet button-small" disabled={gpmBusy} onClick={() => gpmFileRef.current?.click()}>{gpmBusy ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}{gpmBusy ? "Lendo arquivo…" : "Importar imagem / PDF"}</button><button type="button" className="button button-quiet button-small paste-image-button" onPaste={pasteGpmImage} onClick={(event) => { event.currentTarget.focus(); setGpmNotice("Cole a imagem copiada aqui com Ctrl+V."); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") event.currentTarget.focus(); }} title="Clique e cole uma imagem copiada com Ctrl+V"><ClipboardPaste size={14} /> Colar imagem</button></div></div>
            {gpmProgress && <div className="upload-progress"><div><span>{gpmProgress.detail}</span><strong>{Math.round(gpmProgress.progress * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${Math.max(5, gpmProgress.progress * 100)}%` }} /></div></div>}
            {gpmError && <div className="flow-alert"><AlertCircle size={15} />{gpmError}</div>}
            {gpmNotice && <div className="field-note"><Info size={14} /><span>{gpmNotice}</span></div>}
            <div className="form-grid">
              <div className="form-field"><MoneyField label="Financiamento adotado nesta simulação" value={draft.financingAmountCents} onChange={(value) => update({ financingAmountCents: value, financingManualOverride: value !== null && priceCents > 0 && value > Math.floor(priceCents * 0.8) })} hint="Importações e projeções são limitadas a 80%; acima disso, o cálculo só usa o valor se você o editar manualmente." />{draft.gpmReportedFinancingAmountCents !== null && draft.gpmReportedFinancingAmountCents !== undefined && draft.financingAmountCents !== null && draft.gpmReportedFinancingAmountCents !== draft.financingAmountCents && <div className="field-note price-cap-note"><Info size={14} /><span>GPM reportou {formatBRL(draft.gpmReportedFinancingAmountCents)}{draft.gpmReportedPriceReferenceCents ? ` para base de ${formatBRL(draft.gpmReportedPriceReferenceCents)}` : ""}. Valor informado/adotado no cenário: {formatBRL(draft.financingAmountCents)}; confira a origem e o efeito do teto.</span></div>}{draft.financingAmountCents !== null && priceCents > 0 && draft.financingAmountCents > priceCents * 0.8 && <div className="flow-alert danger-alert"><AlertCircle size={15} /><span>{draft.financingManualOverride ? `Override manual: o cálculo usa ${formatBRL(draft.financingAmountCents)}, acima do teto indicativo de 80% (${formatBRL(Math.floor(priceCents * 0.8))}); confirme com a Caixa.` : `Valor salvo acima do teto indicativo de 80% (${formatBRL(Math.floor(priceCents * 0.8))}); até uma edição manual explícita, o cálculo usa o teto.`}</span><button className="button button-small button-quiet" onClick={() => update({ financingAmountCents: Math.floor(priceCents * 0.8), financingManualOverride: false, gpmReportedFinancingAmountCents: draft.gpmReportedFinancingAmountCents ?? draft.financingAmountCents, gpmReportedPriceReferenceCents: draft.gpmReportedPriceReferenceCents ?? priceCents })}>Aplicar teto de 80%</button></div>}</div>
              <div className="form-field"><MoneyField label="1ª parcela PRICE estimada" value={draft.firstPriceInstallmentCents} onChange={(value) => update({ firstPriceInstallmentCents: value })} />{draft.gpmReportedFirstPriceInstallmentCents !== null && draft.gpmReportedFirstPriceInstallmentCents !== undefined && draft.firstPriceInstallmentCents !== null && draft.gpmReportedFirstPriceInstallmentCents !== draft.firstPriceInstallmentCents && <div className="field-note"><Info size={14} /><span>GPM reportou {formatBRL(draft.gpmReportedFirstPriceInstallmentCents)}{draft.gpmReportedPriceReferenceCents ? ` para base de ${formatBRL(draft.gpmReportedPriceReferenceCents)}` : ""}. Valor usado: {formatBRL(draft.firstPriceInstallmentCents)}; projeção proporcional ao preço, não novo cálculo bancário.</span></div>}</div>
              <label className="form-field"><span>Prazo da simulação</span><div className="unit-control"><input type="number" min="1" value={draft.financingTermMonths ?? ""} onChange={(e) => update({ financingTermMonths: e.target.value ? Number(e.target.value) : null })} placeholder="—" /><span>meses</span></div><small>Use o prazo fornecido pelo GPM/PRICE.</small></label>
              <label className="form-field"><span>Linha / faixa informada</span><input value={draft.financingLine} onChange={(e) => update({ financingLine: e.target.value })} placeholder="MCMV, SBPE ou conforme documento" /></label>
              <label className="form-field"><span>Sistema</span><input value={draft.financingSystem} onChange={(e) => update({ financingSystem: e.target.value })} placeholder="PRICE / SAC / não informado" /></label>
              <label className="form-field"><span>Taxa (se constar na simulação)</span><input value={draft.financingRate} onChange={(e) => update({ financingRate: e.target.value })} placeholder="Não presumir" /></label>
              <MoneyField label="Subsídio informado no GPM (não aplicado)" value={draft.gpmReportedSubsidyCents} onChange={(value) => update({ gpmReportedSubsidyCents: value })} hint="Apenas transcrito para conferência; não reduz preço nem implica aprovação." />
              <label className="form-field"><span>Cota reportada no GPM (informativa)</span><div className="unit-control percent-control"><input type="number" min="0" max="100" step="0.01" value={draft.gpmReportedQuotaPercent ?? ""} onChange={(e) => update({ gpmReportedQuotaPercent: e.target.value ? Number(e.target.value) : null })} /><span>%</span></div></label>
              <label className="form-field"><span>Comprometimento reportado (informativo)</span><div className="unit-control percent-control"><input type="number" min="0" max="100" step="0.01" value={draft.gpmReportedIncomeCommitmentPercent ?? ""} onChange={(e) => update({ gpmReportedIncomeCommitmentPercent: e.target.value ? Number(e.target.value) : null })} /><span>%</span></div></label>
              <label className="form-field span-2"><span>Taxas/encargos transcritos e observações da PRICE</span><textarea rows={2} value={draft.gpmReportedFees ?? draft.financingNotes} onChange={(e) => update({ gpmReportedFees: e.target.value, financingNotes: e.target.value })} placeholder="Ex.: seguros, tarifas e encargos conforme documento fornecido." /></label>
            </div>
            {gpmReview && <section className="gpm-review-panel" aria-labelledby="gpm-review-title"><div className="section-heading"><div><span className="eyebrow">RASCUNHO DE OCR · NÃO APLICADO</span><h3 id="gpm-review-title">Revise os dados reconhecidos</h3><p>Corrija valores e desmarque campos que não deseja preencher. Os campos manuais acima continuam disponíveis.</p></div><button className="icon-button" aria-label="Descartar reconhecimento" onClick={() => { setGpmReview(null); setGpmNotice(""); }}><X size={15} /></button></div>
              <div className="form-grid">
                {gpmReview.values.propertyPriceCents !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.propertyPriceCents} onChange={(event) => toggleGpmField("propertyPriceCents", event.target.checked)} /><span>Aplicar preço à simulação</span></label><MoneyField label="Preço do imóvel reconhecido" value={gpmReview.values.propertyPriceCents} onChange={(value) => updateGpmValue("propertyPriceCents", value)} /></div>}
                {gpmReview.values.familyIncomeCents !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.familyIncomeCents} onChange={(event) => toggleGpmField("familyIncomeCents", event.target.checked)} /><span>Aplicar renda ao perfil selecionado</span></label><MoneyField label="Renda familiar reconhecida" value={gpmReview.values.familyIncomeCents} onChange={(value) => updateGpmValue("familyIncomeCents", value)} />{!client && <small>Selecione um cliente na seção 01; a renda não será aplicada sem perfil.</small>}</div>}
                {gpmReview.values.financingAmountCents !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.financingAmountCents} onChange={(event) => toggleGpmField("financingAmountCents", event.target.checked)} /><span>Aplicar valor financiado</span></label><MoneyField label="Financiamento reconhecido" value={gpmReview.values.financingAmountCents} onChange={(value) => updateGpmValue("financingAmountCents", value)} /></div>}
                {gpmReview.values.firstInstallmentCents !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.firstInstallmentCents} onChange={(event) => toggleGpmField("firstInstallmentCents", event.target.checked)} /><span>Aplicar 1ª parcela PRICE</span></label><MoneyField label="1ª parcela reconhecida" value={gpmReview.values.firstInstallmentCents} onChange={(value) => updateGpmValue("firstInstallmentCents", value)} /></div>}
                {gpmReview.values.termMonths !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.termMonths} onChange={(event) => toggleGpmField("termMonths", event.target.checked)} /><span>Aplicar prazo</span></label><label className="form-field"><span>Prazo em meses reconhecido</span><div className="unit-control"><input type="number" min="1" value={gpmReview.values.termMonths} onChange={(event) => updateGpmValue("termMonths", event.target.value ? Number(event.target.value) : null)} /><span>meses</span></div></label></div>}
                {gpmReview.values.financingLine !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.financingLine} onChange={(event) => toggleGpmField("financingLine", event.target.checked)} /><span>Aplicar linha/faixa</span></label><label className="form-field"><span>Linha reconhecida</span><input value={gpmReview.values.financingLine} onChange={(event) => updateGpmValue("financingLine", event.target.value)} /></label></div>}
                {gpmReview.values.financingSystem !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.financingSystem} onChange={(event) => toggleGpmField("financingSystem", event.target.checked)} /><span>Aplicar sistema</span></label><label className="form-field"><span>Sistema reconhecido</span><input value={gpmReview.values.financingSystem} onChange={(event) => updateGpmValue("financingSystem", event.target.value)} /></label></div>}
                {gpmReview.values.rate !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.rate} onChange={(event) => toggleGpmField("rate", event.target.checked)} /><span>Aplicar taxa</span></label><label className="form-field"><span>Taxa reconhecida</span><input value={gpmReview.values.rate} onChange={(event) => updateGpmValue("rate", event.target.value)} /></label></div>}
                {gpmReview.values.subsidyCents !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.subsidyCents} onChange={(event) => toggleGpmField("subsidyCents", event.target.checked)} /><span>Aplicar apenas como dado informado</span></label><MoneyField label="Subsídio reconhecido (não aplicado)" value={gpmReview.values.subsidyCents} onChange={(value) => updateGpmValue("subsidyCents", value)} /></div>}
                {gpmReview.values.fees !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.fees} onChange={(event) => toggleGpmField("fees", event.target.checked)} /><span>Aplicar taxas/encargos como texto</span></label><label className="form-field"><span>Taxas/encargos reconhecidos</span><input value={gpmReview.values.fees} onChange={(event) => updateGpmValue("fees", event.target.value)} /></label></div>}
                {gpmReview.values.quotaPercent !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.quotaPercent} onChange={(event) => toggleGpmField("quotaPercent", event.target.checked)} /><span>Aplicar cota reportada</span></label><label className="form-field"><span>Cota reconhecida (%)</span><input type="number" min="0" max="100" step="0.01" value={gpmReview.values.quotaPercent} onChange={(event) => updateGpmValue("quotaPercent", event.target.value ? Number(event.target.value) : null)} /></label></div>}
                {gpmReview.values.incomeCommitmentPercent !== null && <div className="gpm-review-field"><label className="check-field"><input type="checkbox" checked={gpmReview.selected.incomeCommitmentPercent} onChange={(event) => toggleGpmField("incomeCommitmentPercent", event.target.checked)} /><span>Aplicar comprometimento reportado</span></label><label className="form-field"><span>Comprometimento reconhecido (%)</span><input type="number" min="0" max="100" step="0.01" value={gpmReview.values.incomeCommitmentPercent} onChange={(event) => updateGpmValue("incomeCommitmentPercent", event.target.value ? Number(event.target.value) : null)} /></label></div>}
              </div>
              <div className="field-note"><ShieldCheck size={14} /><span>O texto OCR bruto e o arquivo original não são persistidos. CPF e data de nascimento não entram no perfil; preços, juros, subsídio e aprovação devem ser conferidos no documento.</span></div>
              <div className="form-footer"><span className="form-privacy">Aplicar é uma confirmação explícita; salvar a simulação continua sendo uma ação separada.</span><button className="button button-primary" onClick={applyGpmReview}><Check size={15} /> Aplicar campos marcados</button></div>
            </section>}
            {calculation.financingCapped && <div className="flow-alert danger-alert"><AlertCircle size={15} /> O valor transcrito excede 80% do preço; o simulador usa até 80% no cálculo de recursos próprios. Revise o GPM ou a avaliação informada.</div>}
            {client?.oldestBuyerAge && <div className="field-note"><Info size={14} /><span>Comprador mais velho: {client.oldestBuyerAge} anos. Use o prazo efetivamente aceito na simulação, considerando as regras etárias da Caixa (a confirmar no GPM).</span></div>}
          </section>

          <section className="panel sim-section">
            <div className="sim-section-title"><span className="section-number">03</span><div><h2>Estruture o ato e as parcelas</h2><p>O sistema calcula uma proposta inicial. Você pode substituir cada valor e data.</p></div></div>
            <div className="form-grid">
              <MoneyField label="Ato robusto" value={draft.robustActCents ?? robustAct} onChange={(value) => update({ robustActCents: value })} hint={draft.robustActCents === null ? "Sugestão automática de planejamento, limitada ao ato disponível se informado." : "Valor ajustado manualmente."} />
              <label className="form-field"><span>Fator da anual</span><select value={draft.annualFactor} onChange={(e) => update({ annualFactor: Number(e.target.value) })}><option value={3}>3× a mensal (padrão)</option><option value={4}>4× a mensal</option></select><small>Entre 3× e 4×; confirme capacidade e vencimento.</small></label>
              <label className="form-field"><span>Quantidade de mensais Caixa</span><div className="unit-control"><input type="number" min="0" max={maxMonths ?? undefined} value={shortFlow ? draft.monthlyCountOverride ?? "" : draft.monthlyCountOverride ?? maxMonths ?? ""} onChange={(e) => update({ monthlyCountOverride: e.target.value === "" ? null : Number(e.target.value) })} placeholder={shortFlow ? "Informar condição real" : "Informe entrega"} /><span>parcelas</span></div><small>{shortFlow ? "Sem sugestão automática: transcreva o fluxo recebido da mesa." : maxMonths !== null ? `Pelo calendário: até ${maxMonths}; última antes das chaves.` : "Informe mês e ano para calcular."}</small></label>
              <label className="form-field"><span>Ano/meses das anuais Caixa</span><div className="field-actions-inline"><span>{dueDates.length ? dueDates.map((row) => `${String(row.month).padStart(2, "0")}/${row.year}`).join(" · ") : "Nenhuma sugerida"}</span><button className="text-button" onClick={() => addAnnual("caixa")}><Plus size={13} /> incluir anual</button></div><small>2026 não é incluído. Todas precisam vencer antes das chaves.</small></label>
              {shortFlow && <label className="check-field span-2"><input type="checkbox" checked={draft.actualShortFlowConfirmed} onChange={(e) => update({ actualShortFlowConfirmed: e.target.checked, annualDatesOverride: e.target.checked ? [] : null, directAnnualDatesOverride: e.target.checked ? [] : null, monthlyCountOverride: e.target.checked ? draft.monthlyCountOverride : null, directMonthlyCountOverride: e.target.checked ? draft.directMonthlyCountOverride : null, manualAmounts: e.target.checked ? draft.manualAmounts : { ...draft.manualAmounts, caixaMonthlyCents: undefined, caixaAnnualCents: undefined, directMonthlyCents: undefined, directAnnualCents: undefined } })} /><span>Tenho uma condição curta/pronta informada pela mesa e vou preenchê-la manualmente.<small>Marque somente após receber a condição real; quantidade e valores deixam de ser presumidos.</small></span></label>}
              {deliveryDate && dueDates.map((row) => <div className="annual-editor span-2" key={row.id}><DateField label={`Vencimento da anual ${row.year}`} value={row} onChange={(date) => updateAnnualDate("caixa", row.id, date)} hint="Data precisa ser posterior ao ato e anterior às chaves." /><MoneyField label={`Valor da anual ${row.year} (opcional)`} value={draft.manualAmounts.caixaAnnualCents?.[row.id] ?? calculation.robust?.annualPayments.find((annual) => annual.id === row.id)?.amountCents ?? null} onChange={(value) => setManualAnnual("caixa", row.id, value)} hint="Ao editar, o valor passa a manual." /><button className="icon-button danger-quiet annual-remove" aria-label="Remover anual" onClick={() => setAnnualDates("caixa", dueDates.filter((item) => item.id !== row.id))}><Trash2 size={15} /></button></div>)}
              <div className="field-note span-2"><ShieldCheck size={14} /><span>Ato mínimo comparativo: <strong>{formatBRL(calculation.minimumActCents)}</strong> (2,5% do preço). Intermediárias automáticas usam o fator selecionado. Diferenças manuais permanecem visíveis.</span></div>
              <div className="field-note span-2"><Info size={14} /><span>Premissa comercial informada: 2,5% de ato + até 17,5% parcelados com a Cury (até 20% no total da entrada). Não é condição garantida; confirme a campanha, prazo e forma de pagamento vigentes antes de apresentar.</span></div>
            </div>
            <div className="manual-controls"><button className="button button-quiet button-small" onClick={resetAuto}><RotateCcw size={14} /> Restaurar fluxo automático</button><span>O ajuste manual não altera a PRICE informada nem os dados originais da tabela.</span></div>
          </section>

          <section className="panel sim-section direct-section">
            <div className="sim-section-title"><span className="section-number">04</span><div><h2>Tabela Direta Cury</h2><p>Separada da Caixa; os percentuais incidem sobre o preço total.</p></div><label className="toggle-switch"><input type="checkbox" checked={draft.includeDirect} onChange={(e) => update({ includeDirect: e.target.checked })} /><span>{draft.includeDirect ? "Incluir" : "Desativada"}</span></label></div>
            {draft.includeDirect && <>
              <div className="direct-split-band"><label className="form-field"><span>Pré-chaves</span><div className="unit-control percent-control"><input type="number" min="0" max="100" step="0.1" value={draft.directPrePercent} onChange={(e) => update({ directPrePercent: Number(e.target.value) })} /><span>% do preço</span></div></label><div className="split-divider"><ArrowRight size={16} /></div><div className="direct-post-value"><small>PÓS-CHAVES · DIRETO COM A CURY</small><strong>{formatNumber(calculation.directPostPercent, 1)}% <i>·</i> {formatBRL(calculation.directPostCents)}</strong><span>Montante; prazo/juros não presumidos.</span></div></div>
              {draft.directPrePercent !== 55 && <div className="flow-alert"><Info size={15} /> Percentual alterado manualmente: esta simulação não usa o padrão 55% pré / 45% pós. Confira as condições documentadas.</div>}
              <div className="form-grid direct-settings">
                <label className="form-field"><span>Quantidade de mensais pré-chaves</span><div className="unit-control"><input type="number" min="0" max={maxMonths ?? undefined} value={shortFlow ? draft.directMonthlyCountOverride ?? "" : draft.directMonthlyCountOverride ?? maxMonths ?? ""} onChange={(e) => update({ directMonthlyCountOverride: e.target.value === "" ? null : Number(e.target.value) })} placeholder={shortFlow ? "Informar condição real" : "Automático"} /><span>parcelas</span></div><small>{shortFlow ? "Informe separadamente conforme condição documentada da mesa." : "Mensais terminam antes das chaves."}</small></label>
                <label className="form-field"><span>Intermediárias anuais</span><div className="field-actions-inline"><span>{directDates.length ? directDates.map((row) => `${String(row.month).padStart(2, "0")}/${row.year}`).join(" · ") : "Nenhuma"}</span><button className="text-button" onClick={() => addAnnual("directa")}><Plus size={13} /> incluir</button></div><small>Sem parcela após as chaves.</small></label>
                {directDates.map((row) => <div className="annual-editor span-2" key={row.id}><DateField label={`Vencimento anual ${row.year}`} value={row} onChange={(date) => updateAnnualDate("directa", row.id, date)} /><MoneyField label={`Valor anual ${row.year}`} value={draft.manualAmounts.directAnnualCents?.[row.id] ?? calculation.directRobust?.annualPayments.find((annual) => annual.id === row.id)?.amountCents ?? null} onChange={(value) => setManualAnnual("directa", row.id, value)} /><button className="icon-button danger-quiet annual-remove" aria-label="Remover anual" onClick={() => setAnnualDates("directa", directDates.filter((item) => item.id !== row.id))}><Trash2 size={15} /></button></div>)}
              </div>
              <div className="direct-eligibility"><span className={calculation.directVisible ? "eligibility-check" : "eligibility-pending"}>{calculation.directVisible ? <Check size={14} /> : <AlertCircle size={14} />}</span><div><strong>{calculation.directVisible ? "Fluxo pré-chaves dentro do limite indicativo" : "Tabela Direta ainda não pode ser apresentada como viável"}</strong><p>{calculation.directReason}</p></div></div>
            </>}
          </section>
        </div>

        <aside className="simulator-summary">
          <div className="summary-sticky">
            <section className="summary-intro"><div className="summary-stamp"><ShieldCheck size={18} /><span>ESPELHO DE<br />CONFERÊNCIA</span></div><div><span className="eyebrow">PRÉVIA EM TEMPO REAL</span><h2>Fluxo de pagamento</h2><p>O que entra em cada etapa da compra.</p></div></section>
            <div className="summary-legend"><span><i className="legend-dot cury-dot" />Cury até as chaves</span><span><i className="legend-dot bank-dot" />Caixa / PRICE</span><span><i className="legend-dot direct-dot" />Saldo pós-chaves</span></div>
            <div className="summary-stat-grid"><StatBlock label="PREÇO TOTAL" value={formatBRL(priceCents)} sub="base da simulação" /><StatBlock label="COTA CAIXA USADA" value={calculation.financingPercent !== null ? `${formatNumber(calculation.financingPercent, 1)}%` : "A informar"} sub={calculation.financingUsedCents !== null ? formatBRL(calculation.financingUsedCents) : "transcreva o GPM"} tone="teal" /></div>
            {calculation.warnings.length > 0 && <div className="summary-warnings"><div><AlertCircle size={15} /><strong>Há itens para revisar</strong></div>{calculation.warnings.slice(0, 3).map((warning) => <p key={warning}>{warning}</p>)}</div>}
            <div className="section-heading flow-heading"><div><span className="eyebrow">MODALIDADE A</span><h2>Financiamento Caixa</h2></div></div>
            <FlowPanel title="Ato robusto" scenario={calculation.robust} target={calculation.equityTargetCents} kind="caixa" actDate={actDate} />
            <FlowPanel title="Ato mínimo · comparativo 2,5%" scenario={calculation.minimum} target={calculation.equityTargetCents} kind="caixa" actDate={actDate} />
            {calculation.equityTargetCents !== null && calculation.financingUsedCents !== null && <div className={`audit-footer ${calculation.equityTargetCents + calculation.financingUsedCents === priceCents ? "balanced" : "not-balanced"}`}><span>Recursos próprios + financiamento</span><strong>{formatBRL(calculation.equityTargetCents)} + {formatBRL(calculation.financingUsedCents)} = {formatBRL(calculation.equityTargetCents + calculation.financingUsedCents)}</strong><small>Preço total: {formatBRL(priceCents)} · Diferença: {formatBRL(calculation.equityTargetCents + calculation.financingUsedCents - priceCents)}</small></div>}
            {draft.includeDirect && <><div className="section-heading flow-heading"><div><span className="eyebrow">MODALIDADE B</span><h2>Tabela Direta Cury</h2></div></div><FlowPanel title="Pré-chaves · ato robusto" scenario={calculation.directRobust} target={calculation.directPreCents} kind="direta" actDate={actDate} /><FlowPanel title="Pré-chaves · ato mínimo" scenario={calculation.directMinimum} target={calculation.directPreCents} kind="direta" actDate={actDate} /><div className="direct-total-audit"><div><span>Pré-chaves ({formatNumber(calculation.directPrePercent, 1)}%)</span><strong>{formatBRL(calculation.directPreCents)}</strong></div><div><span>Pós-chaves ({formatNumber(calculation.directPostPercent, 1)}%)</span><strong>{formatBRL(calculation.directPostCents)}</strong></div><div className="sum-line"><span>Soma sobre o preço total</span><strong>{formatBRL(calculation.directPreCents + calculation.directPostCents)} · Δ {formatBRL(calculation.directPreCents + calculation.directPostCents - priceCents)}</strong></div></div></>}
            <div className="segmented-tabs"><button className={view === "interno" ? "active" : ""} onClick={() => setView("interno")}><FileText size={14} /> Interno</button><button className={view === "whatsapp" ? "active" : ""} onClick={() => setView("whatsapp")}><MessageCircleIcon /> WhatsApp</button></div>
            {view === "interno" ? <div className="summary-document"><pre>{internalSummary}</pre><button className="button button-quiet button-full" onClick={async () => { await navigator.clipboard.writeText(internalSummary); setToast("Conferência interna copiada."); window.setTimeout(() => setToast(""), 3000); }}><Copy size={14} /> Copiar conferência interna</button></div> : <div className="whatsapp-preview"><div className="whatsapp-head"><span className="whatsapp-dot" /><strong>Prévia · texto para o cliente</strong></div><textarea value={message} readOnly rows={19} /><div className="whatsapp-actions"><button className="button button-light-green" disabled={!modeCanCopy} onClick={() => void copyMessage()}><Copy size={15} /> Copiar texto</button><button className="button button-primary" disabled={!modeCanCopy} onClick={openWhatsApp}><Send size={15} /> Abrir WhatsApp</button></div>{!modeCanCopy && <p className="send-blocked"><AlertCircle size={13} /> Conclua a conferência antes de copiar ou abrir a mensagem.</p>}<p className="small-note">O site não envia mensagens automaticamente. A abertura do WhatsApp é iniciada por você.</p></div>}
            {toast && <div className="inline-status"><Check size={14} />{toast}</div>}
            {notice && <div className="inline-status"><Check size={14} />{notice}</div>}
            <div className="fgts-note"><Info size={14} /><span>FGTS não compõe a entrada. Eventual uso para amortização bancária depende dos requisitos e da análise vigentes.</span></div>
          </div>
        </aside>
      </div>
      <section className="panel comparison-session" aria-labelledby="comparison-session-title">
        <div className="section-heading comparison-session-heading">
          <div><span className="eyebrow">CONJUNTO DE COMPARAÇÃO</span><h2 id="comparison-session-title">Todos os cenários lado a lado</h2><p>Inclui as fichas adicionadas a este conjunto e o rascunho aberto. Cada cenário conserva seu próprio GPM/PRICE, ato, mensais e datas.</p></div>
          <span className="count-badge">{comparisonEntries.length} cenário(s)</span>
        </div>
        <div className="add-scenario-controls">
          <SearchableUnitSelect label="Empreendimento para a próxima simulação" units={workspace.portfolio} value={nextPropertyId || workspace.portfolio[0]?.id || ""} onChange={setNextPropertyId} emptyLabel="Selecione o empreendimento para continuar" />
          <button className="button button-primary" disabled={!workspace.portfolio.length} onClick={addScenario}><Plus size={15} /> Salvar atual e adicionar cenário</button>
        </div>
        <p className="small-note comparison-note">Use “Salvar atual e adicionar cenário” para manter fichas relacionadas no mesmo conjunto. Os destaques “menor” são apenas comparações numéricas e não significam aprovação, melhor custo total ou recomendação de crédito.</p>
        <div className="compare-table-wrap scenario-table-wrap">
          <table className="compare-table scenario-comparison-table">
            <thead><tr><th>Empreendimento · base</th><th>Financiamento Caixa</th><th>PRICE informada</th><th>Caixa · ato robusto / mínimo</th><th>Caixa · fluxo robusto</th><th>Direta · ato robusto / mínimo</th><th>Direta · fluxo pré-chaves</th><th>Direta · pós-chaves</th><th>Alertas / estado</th><th>Abrir</th></tr></thead>
            <tbody>{comparisonEntries.map((entry) => {
              const calc = entry.calculation;
              const robust = calc?.robust;
              const direct = calc?.directRobust;
              const annualTotal = (flow: FlowScenario | null | undefined) => flow?.annualPayments.reduce((sum, payment) => sum + (payment.amountCents ?? 0), 0) ?? null;
              const isCurrent = entry.simulation.id === draft.id;
              const manualOverrideAboveCap = Boolean(entry.simulation.financingManualOverride && entry.simulation.financingAmountCents !== null && entry.simulation.financingAmountCents > Math.floor(entry.priceCents * 0.8));
              const financingAdjustmentLabel = manualOverrideAboveCap ? " · override manual acima de 80%" : calc?.financingCapped ? " · limitado automaticamente a 80%" : entry.simulation.gpmReportedFinancingAmountCents !== null && entry.simulation.gpmReportedFinancingAmountCents !== undefined && entry.simulation.financingAmountCents !== null && entry.simulation.gpmReportedFinancingAmountCents > entry.simulation.financingAmountCents ? " · ajustado/projetado a partir do GPM" : "";
              return <tr key={entry.simulation.id} className={isCurrent ? "current-scenario-row" : ""}>
                <td><strong>{entry.unit?.project ?? "Unidade removida"}</strong><small>{entry.unit?.typology ?? "Tipologia pendente"} · {entry.unit?.neighborhood ?? entry.unit?.region ?? "Região pendente"}</small><small>Preço: {entry.priceCents > 0 ? formatBRL(entry.priceCents) : "a informar"}</small><small>Entrega: {entry.deliveryDate ? monthLabelCapitalized(entry.deliveryDate) : entry.unit?.deliveryText ?? "pendente"}</small><small>Fonte: {entry.unit?.source ?? "indisponível"} · {entry.unit?.sourceDate ?? "data pendente"}</small></td>
                <td><strong>{entry.simulation.gpmReportedFinancingAmountCents !== null && entry.simulation.gpmReportedFinancingAmountCents !== undefined ? formatBRL(entry.simulation.gpmReportedFinancingAmountCents) : entry.simulation.financingAmountCents !== null ? formatBRL(entry.simulation.financingAmountCents) : "Pendente"}</strong>{entry.simulation.gpmReportedPriceReferenceCents && <small>Reportado para base {formatBRL(entry.simulation.gpmReportedPriceReferenceCents)}</small>}<small>Usado: {calc?.financingUsedCents !== null && calc?.financingUsedCents !== undefined ? formatBRL(calc.financingUsedCents) : "não calculado"}{financingAdjustmentLabel}</small><small>{calc?.financingPercent !== null && calc?.financingPercent !== undefined ? `${formatNumber(calc.financingPercent, 1)}% do preço` : "Cota não informada"}</small></td>
                <td><strong>{entry.simulation.firstPriceInstallmentCents !== null ? formatBRL(entry.simulation.firstPriceInstallmentCents) : "Pendente"}</strong>{entry.simulation.gpmReportedFirstPriceInstallmentCents !== null && entry.simulation.gpmReportedFirstPriceInstallmentCents !== undefined && <small>GPM: {formatBRL(entry.simulation.gpmReportedFirstPriceInstallmentCents)}{entry.simulation.gpmReportedPriceReferenceCents ? ` · base ${formatBRL(entry.simulation.gpmReportedPriceReferenceCents)}` : ""}</small>}{isLowest(entry.simulation.firstPriceInstallmentCents, lowestPriceFirstInstallment) && <small className="comparison-best">Menor 1ª PRICE deste cenário</small>}<small>{entry.simulation.gpmReportedFirstPriceInstallmentCents !== null && entry.simulation.gpmReportedFirstPriceInstallmentCents !== undefined && entry.simulation.gpmReportedFirstPriceInstallmentCents !== entry.simulation.firstPriceInstallmentCents ? "Estimativa proporcional/ajustável; confirme com novo GPM" : "1ª prestação informada/estimada"}</small><small>Prazo: {entry.simulation.financingTermMonths ? `${entry.simulation.financingTermMonths} meses` : "não informado"}</small><small>Sistema: {entry.simulation.financingSystem || "não informado"}</small></td>
                <td><strong>{formatBRL(robust?.actCents ?? null)} · {formatBRL(calc?.minimumActCents ?? null)}</strong>{isLowest(robust?.actCents, lowestRobustAct) && <small className="comparison-best">Menor ato robusto</small>}{isLowest(calc?.minimumActCents, lowestMinimumAct) && <small className="comparison-best">Menor ato mínimo</small>}<small>Robusto / mínimo (2,5%)</small></td>
                <td><strong>{robust?.monthlyCount ?? "—"} mensais · {formatBRL(robust?.regularMonthlyCents ?? null)}</strong><small>{robust?.annualPayments.length ?? 0} anuais · {formatBRL(annualTotal(robust))} no total</small><small>À Cury até chaves: {formatBRL(robust?.scheduledTotalCents ?? null)}</small>{isLowest(robust?.regularMonthlyCents, lowestCaixaMonthly) && <small className="comparison-best">Menor mensal Caixa</small>}</td>
                <td><strong>{formatBRL(calc?.directRobust?.actCents ?? null)} · {formatBRL(calc?.directMinimum?.actCents ?? null)}</strong>{isLowest(calc?.directRobust?.actCents, lowestDirectRobustAct) && <small className="comparison-best">Menor ato robusto Direta</small>}{isLowest(calc?.directMinimum?.actCents, lowestDirectMinimumAct) && <small className="comparison-best">Menor ato mínimo Direta</small>}<small>Robusto / mínimo (2,5%)</small></td>
                <td><strong>{entry.simulation.includeDirect ? `${direct?.monthlyCount ?? "—"} mensais · ${formatBRL(direct?.regularMonthlyCents ?? null)}` : "Não incluída"}</strong><small>{direct?.annualPayments.length ?? 0} anuais · {formatBRL(annualTotal(direct))} no total</small><small>Pré-chaves: {formatBRL(direct?.scheduledTotalCents ?? null)} · {formatNumber(calc?.directPrePercent ?? 0, 1)}%</small>{isLowest(direct?.regularMonthlyCents, lowestDirectMonthly) && <small className="comparison-best">Menor mensal Direta</small>}</td>
                <td><strong>{entry.simulation.includeDirect ? `${formatNumber(calc?.directPostPercent ?? 0, 1)}% · ${formatBRL(calc?.directPostCents ?? null)}` : "Não incluída"}</strong><small>Saldo pós-chaves, sem prazo/juros presumidos</small></td>
                <td><span className={`audit-chip ${robust?.isBalanced ? "ok" : "review"}`}>{robust?.isBalanced ? "CAIXA FECHA" : "CAIXA · REVISAR"}</span>{entry.simulation.includeDirect && <small><span className={`audit-chip ${calc?.directVisible ? "ok" : "review"}`}>{calc?.directVisible ? "DIRETA INDICATIVA" : "DIRETA · PENDENTE"}</span></small>}<small>{calc?.warnings[0] ?? (entry.simulation.financingAmountCents === null ? "Informe a Caixa/GPM/PRICE." : "Sem alerta calculado." )}</small></td>
                <td>{isCurrent ? <span className="current-scenario-label">Atual</span> : <button className="text-button" onClick={() => { if (!property || priceCents <= 0) { setNotice("Informe o preço e salve o rascunho atual antes de abrir outra ficha."); return; } onSave({ ...draft, propertyId: property.id, updatedAt: new Date().toISOString() }); setActiveSimulation(entry.simulation); }}>Abrir</button>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="comparison-premises"><Info size={15} /><span>Ato robusto e mínimo, recursos próprios, mensais, anuais, prestação PRICE e saldo pós-chaves são rubricas diferentes. A comparação exibe valores e pendências; confira o prazo total, condições documentadas e disponibilidade antes de decidir.</span></div>
      </section>
      {newClientOpen && <div className="modal-scrim" role="presentation" onClick={() => setNewClientOpen(false)}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="quick-client-title" onClick={(e) => e.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">CADASTRO RÁPIDO</span><h2 id="quick-client-title">Quem vai comprar?</h2></div><button className="icon-button" onClick={() => setNewClientOpen(false)} aria-label="Fechar"><X size={17} /></button></div><label className="form-field"><span>Nome</span><input autoFocus value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Nome do cliente" /></label><MoneyField label="Renda familiar mensal" value={newClientIncome} onChange={setNewClientIncome} /><div className="form-footer"><button className="button button-quiet" onClick={() => setNewClientOpen(false)}>Cancelar</button><button className="button button-primary" disabled={!newClientName.trim()} onClick={createQuickClient}><Plus size={15} /> Criar perfil</button></div><p className="small-note">Você poderá completar o restante do perfil na seção Clientes.</p></div></div>}
    </div>
  );
}

function MessageCircleIcon() { return <span className="message-mini">WA</span>; }
