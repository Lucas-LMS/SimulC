import { useState } from "react";
import { ArrowRight, Building2, CalendarDays, MapPin, Sparkles, WalletCards } from "lucide-react";
import type { SimulationRecord, WorkspaceData } from "../lib/models";
import { formatBRL, formatNumber } from "../lib/money";
import { recommendUnitsForLead } from "../lib/leads";
import { clientPriceProfileToSimulation, projectClientPriceProfile } from "../lib/clientPriceProfile";
import { makeNewSimulation } from "./SimulatorPage";

interface Props { workspace: WorkspaceData; onLoadSimulation: (simulation: SimulationRecord) => void; }
const unitPrice = (unit: WorkspaceData["portfolio"][number]) => unit.priceCents ?? unit.priceLowCents ?? null;

export default function RecommendationsPage({ workspace, onLoadSimulation }: Props) {
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const groups = workspace.clients.map((client) => {
    const prefOptions = recommendUnitsForLead(client, workspace.portfolio);
    const prefById = new Map(prefOptions.map((item) => [item.unit.id, item]));
    const hasPreferences = Boolean(client.preferences && (client.preferences.desiredAreas.trim() || client.preferences.bedrooms !== null || client.preferences.parking !== null || client.preferences.deliveryYear !== null));
    const hasFinance = Boolean(client.priceProfile && (client.priceProfile.priceReferenceCents || client.priceProfile.financingAmountCents || client.priceProfile.gpmReportedFinancingAmountCents || client.priceProfile.firstPriceInstallmentCents));
    if (!hasPreferences && !hasFinance) return null;
    const options = workspace.portfolio.filter((unit) => unit.active !== false).map((unit) => {
      const preference = prefById.get(unit.id);
      const price = unitPrice(unit);
      const projection = projectClientPriceProfile(client.priceProfile, price);
      let financeScore = 50;
      let financeLabel = client.priceProfile ? "PRICE salva; projeção pendente" : "Sem dados PRICE/GPM no perfil";
      const estimatedAct = price !== null && projection.financingAmountCents !== null ? Math.max(0, price - projection.financingAmountCents) : null;
      const monthlyLimit = client.monthlyCapacityCents ?? (client.incomeFamilyCents ? Math.round(client.incomeFamilyCents * 0.3) : null);
      const monthly = projection.firstPriceInstallmentCents;
      if (monthly !== null && monthlyLimit !== null && monthlyLimit > 0) {
        const ratio = monthly / monthlyLimit;
        financeScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, ratio - 0.65) * 160)));
        financeLabel = ratio <= 1 ? `1ª PRICE estimada ${formatBRL(monthly)} · dentro da capacidade informada` : `1ª PRICE estimada ${formatBRL(monthly)} · acima da capacidade informada`;
      } else if (projection.financingAmountCents !== null) {
        financeScore = 65;
        financeLabel = `Financiamento estimado ${formatBRL(projection.financingAmountCents)} · ${estimatedAct !== null ? `saldo inicial ${formatBRL(estimatedAct)}` : "ato não estimado"}`;
      } else if (price !== null && client.availableActCents !== null) {
        financeScore = price <= client.availableActCents ? 85 : Math.max(10, Math.round(85 * client.availableActCents / price));
        financeLabel = `Preço ${formatBRL(price)} · ato informado ${formatBRL(client.availableActCents)}`;
      }
      const preferenceScore = preference?.score ?? (hasPreferences ? 20 : 50);
      const score = Math.round((hasPreferences ? preferenceScore * 0.58 + financeScore * 0.42 : financeScore));
      const simulation: SimulationRecord = {
        ...makeNewSimulation(client.id, unit.id), ...clientPriceProfileToSimulation(client.priceProfile, price),
        origin: "lead_recommendation", recommendation: { score, reasons: preference?.reasons ?? [], mismatches: preference?.mismatches ?? [] },
        internalNotes: `Sugestão ordenada por preferências e dados financeiros informados. ${projection.message}`,
      };
      return { unit, price, score, financeScore, financeLabel, preference, projection, estimatedAct, simulation };
    }).sort((a, b) => b.score - a.score || b.financeScore - a.financeScore || (a.price ?? Infinity) - (b.price ?? Infinity));
    return { client, options, hasPreferences, hasFinance };
  }).filter((group): group is NonNullable<typeof group> => group !== null && group.options.length > 0);
  const count = groups.reduce((sum, group) => sum + group.options.length, 0);

  return <div className="page-stack recommendations-page">
    <section className="recommendations-hero"><div className="recommendations-hero-copy"><span className="eyebrow"><Sparkles size={13} /> SUGESTÕES A PARTIR DO PERFIL</span><h1>Opções para retomar a conversa.</h1><p>Catálogo ordenado pela combinação entre preferências e PRICE/GPM informado. Valores projetados são estimativas proporcionais, não aprovação bancária.</p></div><div className="recommendations-hero-stat"><span><WalletCards size={17} /> OPÇÕES AVALIADAS</span><strong>{count}</strong><small>{groups.length} cliente(s) com dados para cruzar</small></div></section>
    {!groups.length ? <section className="panel recommendations-empty"><span className="recommendation-empty-icon"><Sparkles size={20} /></span><strong>Cadastre preferências ou dados financeiros no perfil.</strong><p>As opções do catálogo serão ordenadas assim que houver informações para comparar.</p></section> : <div className="recommendation-groups">{groups.map(({ client, options, hasPreferences, hasFinance }) => <section className="recommendation-group" key={client.id}>
      <header className="recommendation-group-head"><div className="recommendation-client-mark">{client.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</div><div className="recommendation-client-copy"><span className="eyebrow">CLIENTE</span><h2>{client.name}</h2><p>{client.incomeFamilyCents ? `Renda familiar ${formatBRL(client.incomeFamilyCents)}/mês` : "Renda ainda não informada"}{client.oldestBuyerAge ? ` · ${client.oldestBuyerAge} anos` : ""}</p></div><span className="recommendation-group-count">{options.length} opções avaliadas</span></header>
      <div className="recommendation-options">{(expandedClients[client.id] ? options : options.slice(0, 12)).map((item, index) => {
        const { unit, price, score, preference, projection, financeLabel } = item;
        const delivery = unit.deliveryMonth && unit.deliveryYear ? `${String(unit.deliveryMonth).padStart(2, "0")}/${unit.deliveryYear}` : unit.deliveryYear ? `${unit.deliveryYear} · mês a confirmar` : "A confirmar";
        return <article className="recommendation-option" key={unit.id}>
          <div className="recommendation-option-top"><span className="recommendation-rank">{String(index + 1).padStart(2, "0")}</span><span className="recommendation-score">{formatNumber(score, 0)}% compatibilidade</span><span className={`recommendation-fit ${item.financeScore >= 70 ? "good" : item.financeScore < 40 ? "review" : "neutral"}`}>{item.financeScore >= 70 ? "Financeiro favorável" : item.financeScore < 40 ? "Revisar capacidade" : "Financeiro a confirmar"}</span></div>
          <div className="recommendation-score-track" aria-label={`${score}% de compatibilidade`}><span style={{ width: `${score}%` }} /></div>
          <div className="recommendation-property-heading"><span className="recommendation-property-icon"><Building2 size={17} /></span><div><span className="eyebrow">OPÇÃO NO CATÁLOGO</span><h3>{unit.project}</h3></div></div>
          <p className="recommendation-typology">{unit.typology}{unit.bedrooms ? ` · ${unit.bedrooms} quartos` : ""}{unit.parking ? " · vaga" : ""}</p>
          <div className="recommendation-facts"><span><MapPin size={14} />{unit.neighborhood || unit.region || "Região a confirmar"}</span><span><CalendarDays size={14} />Entrega {delivery}</span></div>
          <div className="recommendation-price"><div><small>PREÇO REFERENCIAL</small><strong>{formatBRL(price)}</strong></div><span>{unit.source ?? "Fonte pendente"}<br />{unit.sourceDate ?? "data não informada"}</span></div>
          <div className="recommendation-finance"><strong>{financeLabel}</strong>{projection.canProjectAmounts && <small>{projection.message}</small>}</div>
          <div className="recommendation-reasons"><strong>{hasPreferences ? "Preferências" : "Critério de ordenação"}</strong><p>{preference?.reasons.join(" ") || (hasPreferences ? "Correspondência parcial; confira região, tipologia e entrega." : "Ordenada pelos dados financeiros disponíveis no perfil.")}</p>{preference?.mismatches.length ? <p className="recommendation-mismatch">A conferir: {preference.mismatches.join(" ")}</p> : null}</div>
          <div className="recommendation-option-footer"><small>{hasFinance ? "PRICE/GPM aplicado ao preço referencial" : "Cadastre PRICE/GPM para melhorar a classificação"}</small><button className="button button-primary" onClick={() => onLoadSimulation(item.simulation)}>Abrir simulação <ArrowRight size={15} /></button></div>
        </article>;
      })}</div>{options.length > 12 && <button className="button button-quiet recommendation-show-more" onClick={() => setExpandedClients((current) => ({ ...current, [client.id]: !current[client.id] }))}>{expandedClients[client.id] ? "Mostrar as 12 principais" : `Mostrar mais ${options.length - 12} opções`}</button>}
    </section>)}</div>}
    <div className="recommendation-disclaimer"><Sparkles size={15} /><span>A classificação cruza preferências com PRICE/GPM e capacidade registrados. Projeção de PRICE/financiamento é proporcional ao preço-base quando disponível; limite de renda de 30% é apenas referência quando não há capacidade mensal declarada. Não é análise bancária, confirmação de disponibilidade nem aprovação.</span></div>
  </div>;
}
import { useState } from "react";
