import { parseMoneyInput } from "./money";
import type { ClientProfile } from "./models";
import type { PortfolioUnit } from "../data/portfolio";
import { classifyRegion, type CatalogRegion } from "./catalogFilters";

export interface LeadDraft {
  name: string;
  phone: string;
  incomeFamilyCents: number | null;
  oldestBuyerAge: number | null;
  fgtsBalanceCents: number | null;
  employmentRegime: string;
  threeYearsWorkHistory: boolean | null;
  preferences: NonNullable<ClientProfile["preferences"]>;
}

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

const normalizeWithOffsets = (value: string) => {
  let normalized = "";
  const sourceOffsets: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    normalized += ch;
    for (let offset = 0; offset < ch.length; offset += 1) sourceOffsets.push(index);
  }
  return { normalized, sourceOffsets };
};

const answerFor = (text: string, label: RegExp): string => {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const { normalized, sourceOffsets } = normalizeWithOffsets(lines[index]);
    const match = label.exec(normalized);
    if (!match) continue;
    const normalizedEnd = match.index + match[0].length;
    const rawEnd = normalizedEnd < sourceOffsets.length ? sourceOffsets[normalizedEnd] : lines[index].length;
    const inline = lines[index].slice(rawEnd).replace(/^\s*[:?\-–—]*\s*/, "").replace(/^(?:\([^)]*\)\s*)+/, "").trim();
    if (inline) return inline;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next].trim();
      if (candidate) return candidate;
    }
  }
  return "";
};

const parseBirthAge = (value: string, today: Date): number | null => {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  let day = Number(digits.slice(0, 2));
  let month = Number(digits.slice(2, 4));
  let year = Number(digits.slice(4, 8));
  const leadingYear = Number(digits.slice(0, 4));
  if (leadingYear >= 1900 && leadingYear <= 2100) {
    year = leadingYear;
    month = Number(digits.slice(4, 6));
    day = Number(digits.slice(6, 8));
  }
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || year < 1900 || birth > today) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  return age >= 18 && age <= 110 ? age : null;
};

const parseBedrooms = (value: string): number | null => {
  const match = normalize(value).match(/\b(\d{1,2})\s*(?:quartos?|q(?:tos?)?)\b/);
  return match ? Number(match[1]) : null;
};

const parseParking = (value: string): boolean | null => {
  const normalized = normalize(value);
  if (/sem\s+vaga|s\/\s*vaga|s\s+vaga/.test(normalized)) return false;
  if (/com\s+vaga|c\/\s*vaga|c\s+vaga|vaga/.test(normalized)) return true;
  return null;
};

const parseWorkHistory = (value: string): boolean | null => {
  const normalized = normalize(value).trim();
  if (/^(sim|s|yes|true|tenho|mais de 3|3\+|acima de 3)/.test(normalized)) return true;
  if (/^(nao|n|no|false|menos de 3)/.test(normalized)) return false;
  return null;
};

/** Extract only relevant lead fields. The original text/date of birth is never returned or persisted. */
export const parseLeadForm = (text: string, today = new Date()): LeadDraft => {
  const area = answerFor(text, /(?:qual\s+)?regiao\s+mais\s+interessa\s*\??/);
  const roomAnswer = answerFor(text, /quantos\s+quartos\s*\??/);
  const deliveryAnswer = answerFor(text, /(?:preferencia\s+pelo\s+prazo\s+de\s+entrega|prazo\s+de\s+entrega)[^?]*\??/);
  const workAnswer = answerFor(text, /(?:qual\s+seu\s+)?regime\s+trabalhista\s*\??/);
  const yearsAnswer = answerFor(text, /possui\s+pelo\s+menos\s+3\s+anos\s+de\s+carteira\s+assinada\s*\??/);
  const fgtsAnswer = answerFor(text, /qual\s+valor\s+de\s+fgts\s+disponivel\s*\??/);
  const birthAnswer = answerFor(text, /qual\s+sua\s+data\s+de\s+nascimento\s*\??/);
  const incomeAnswer = answerFor(text, /qual\s+renda\s+bruta\s+familiar\s*\??/);
  const name = answerFor(text, /(?:full\s+name|nome\s+completo|nome\s+do\s+cliente)\s*:?/);
  const phone = answerFor(text, /(?:whatsapp\s+number|phone\s+number|telefone|celular)\s*:?/);
  const deliveryMatch = deliveryAnswer.match(/\b(20\d{2})\b/);
  const normalizedFgts = normalize(fgtsAnswer);
  const fgtsBalanceCents = /nao\s+tenho|sem\s+fgts|nenhum|zero/.test(normalizedFgts) ? 0 : parseMoneyInput(fgtsAnswer);

  return {
    name: name.trim(),
    phone: phone.trim(),
    incomeFamilyCents: parseMoneyInput(incomeAnswer),
    oldestBuyerAge: parseBirthAge(birthAnswer, today),
    fgtsBalanceCents,
    employmentRegime: workAnswer.trim(),
    threeYearsWorkHistory: parseWorkHistory(yearsAnswer),
    preferences: {
      desiredAreas: area.trim(),
      bedrooms: parseBedrooms(roomAnswer),
      parking: parseParking(roomAnswer),
      deliveryYear: deliveryMatch ? Number(deliveryMatch[1]) : null,
    },
  };
};

const unitBedrooms = (unit: PortfolioUnit) => unit.bedrooms ?? parseBedrooms(unit.typology);
const unitDeliveryYear = (unit: PortfolioUnit) => unit.deliveryYear ?? (Number(unit.deliveryText.match(/20\d{2}/)?.[0] ?? 0) || null);
const normalizeForSearch = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, " ").trim();

export interface LeadRecommendation {
  unit: PortfolioUnit;
  score: number;
  tier: "preferred-region" | "preferred-typology" | "other-relevant";
  reasons: string[];
  mismatches: string[];
}

const desiredRegionClasses = (areaText: string): Set<CatalogRegion> => {
  const normalized = normalizeForSearch(areaText);
  const regions = new Set<CatalogRegion>();
  if (/zona norte|sao cristovao/.test(normalized)) regions.add("Zona Norte");
  // In this project's lead form, Barra/Recreio is the preferred Sudoeste
  // macro-area. Exact Recreio matches are also kept even when a catalog row
  // is classified as Zona Oeste by its neighborhood.
  if (/zona sudoeste|\bbarra\b|\brecreio\b/.test(normalized)) regions.add("Zona Sudoeste");
  if (/zona oeste|\brecreio\b/.test(normalized)) regions.add("Zona Oeste");
  if (/porto|centro/.test(normalized)) regions.add("Porto Maravilha/Centro");
  if (/niteroi/.test(normalized)) regions.add("Niterói");
  return regions;
};

/** Prioritize location, then the exact requested bedroom/parking typology, then delivery year. */
export const recommendUnitsForLead = (lead: Pick<LeadDraft, "preferences"> | Pick<ClientProfile, "preferences">, portfolio: PortfolioUnit[]): LeadRecommendation[] => {
  const preferences = lead.preferences;
  if (!preferences) return [];
  const areaParts = preferences.desiredAreas.split(/[\/,;|]+/).map(normalizeForSearch).filter(Boolean);
  const preferredRegions = desiredRegionClasses(preferences.desiredAreas);
  const hasAreaPreference = areaParts.length > 0;
  const hasTypologyPreference = preferences.bedrooms !== null || preferences.parking !== null;
  const candidates: Array<{ unit: PortfolioUnit; tier: LeadRecommendation["tier"]; areaHits: string[] }> = [];

  for (const unit of portfolio.filter((item) => item.active !== false && !/\bvaga\s+avulsa\b/i.test(item.typology))) {
    const unitSearch = normalizeForSearch(`${unit.neighborhood} ${unit.project} ${unit.region}`);
    const areaHits = areaParts.filter((part) => unitSearch.includes(part));
    const regionMatch = preferredRegions.has(classifyRegion(unit));
    const preferredAreaMatch = hasAreaPreference && (regionMatch || areaHits.length > 0);
    const bedrooms = unitBedrooms(unit);
    const bedroomMatch = preferences.bedrooms === null || bedrooms === preferences.bedrooms;
    const parkingMatch = preferences.parking === null || unit.parking === preferences.parking;
    const typologyMatch = hasTypologyPreference && bedroomMatch && parkingMatch;
    let tier: LeadRecommendation["tier"] | null = null;

    if (preferredAreaMatch) tier = "preferred-region";
    else if (hasAreaPreference && hasTypologyPreference && typologyMatch) tier = "preferred-typology";
    else if (!hasAreaPreference && hasTypologyPreference && typologyMatch) tier = "preferred-typology";
    else if (!hasAreaPreference && !hasTypologyPreference) {
      const deliveryYear = unitDeliveryYear(unit);
      const deliveryHit = preferences.deliveryYear !== null && deliveryYear === preferences.deliveryYear;
      if (deliveryHit) tier = "other-relevant";
    }
    if (!tier) continue;
    candidates.push({ unit, tier, areaHits });
  }

  const tierOrder: Record<LeadRecommendation["tier"], number> = { "preferred-region": 0, "preferred-typology": 1, "other-relevant": 2 };
  const yearDistance = (unit: PortfolioUnit) => {
    const year = unitDeliveryYear(unit);
    if (preferences.deliveryYear === null) return year ?? Number.POSITIVE_INFINITY;
    return year === null ? Number.POSITIVE_INFINITY : Math.abs(year - preferences.deliveryYear);
  };
  const typologyRank = (unit: PortfolioUnit) => {
    if (!hasTypologyPreference) return 1;
    const bedrooms = unitBedrooms(unit);
    return (preferences.bedrooms === null || bedrooms === preferences.bedrooms)
      && (preferences.parking === null || unit.parking === preferences.parking) ? 0 : 1;
  };
  candidates.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]
    || typologyRank(a.unit) - typologyRank(b.unit)
    || yearDistance(a.unit) - yearDistance(b.unit)
    || (a.unit.priceCents ?? a.unit.priceLowCents ?? Number.POSITIVE_INFINITY) - (b.unit.priceCents ?? b.unit.priceLowCents ?? Number.POSITIVE_INFINITY));

  return candidates.map(({ unit, tier, areaHits }) => {
    const reasons: string[] = [];
    const mismatches: string[] = [];
    const bedrooms = unitBedrooms(unit);
    const bedroomMatch = preferences.bedrooms === null || bedrooms === preferences.bedrooms;
    const parkingMatch = preferences.parking === null || unit.parking === preferences.parking;
    const typologyMatch = hasTypologyPreference && bedroomMatch && parkingMatch;
    const deliveryYear = unitDeliveryYear(unit);
    const regionMatch = preferredRegions.has(classifyRegion(unit));
    if (tier === "preferred-region") {
      reasons.push(regionMatch ? `Região prioritária: ${[...preferredRegions].join(" / ") || classifyRegion(unit)}.` : `Localidade desejada: ${areaHits.join(" / ") || unit.neighborhood || unit.region}.`);
      if (hasAreaPreference && !areaHits.length && regionMatch) reasons.push("Incluída pela região, sem restringir tipologia.");
    } else if (tier === "preferred-typology") {
      const requestedTypology = [preferences.bedrooms !== null ? `${preferences.bedrooms} quartos` : "", preferences.parking === true ? "com vaga" : preferences.parking === false ? "sem vaga" : ""].filter(Boolean).join(" ");
      reasons.push(`${requestedTypology || "Tipologia desejada"}${hasAreaPreference ? " em outra região" : ""}.`);
      if (hasAreaPreference) mismatches.push(`Região diferente da preferência ${preferences.desiredAreas}.`);
    } else reasons.push("Correspondência pelas demais preferências informadas.");

    if (preferences.bedrooms !== null) {
      if (bedroomMatch) reasons.push(`${bedrooms} quartos, conforme preferência.`);
      else if (bedrooms === null) mismatches.push("Quantidade de quartos não confirmada no catálogo.");
      else mismatches.push(`Tem ${bedrooms} quartos; preferência ${preferences.bedrooms}.`);
    }
    if (preferences.parking !== null) {
      if (unit.parking === preferences.parking) reasons.push(preferences.parking ? "Vaga informada no catálogo." : "Sem vaga, conforme preferência.");
      else if (unit.parking === "unknown") mismatches.push("Vaga a confirmar no catálogo.");
      else mismatches.push(preferences.parking ? "Unidade cadastrada sem vaga; mantida por estar na região prioritária." : "Unidade cadastrada com vaga; mantida por estar na região prioritária.");
    }
    if (preferences.deliveryYear && deliveryYear) {
      if (deliveryYear === preferences.deliveryYear) reasons.push(`Entrega cadastrada para ${deliveryYear}, ano preferido.`);
      else mismatches.push(`Entrega ${deliveryYear}; preferência ${preferences.deliveryYear}.`);
    } else if (preferences.deliveryYear) mismatches.push("Ano de entrega não confirmado no catálogo.");
    if (unit.priceCents === undefined && unit.priceLowCents === undefined) mismatches.push("Preço não informado; a simulação não terá preço até preenchimento.");

    const yearMatch = preferences.deliveryYear !== null && deliveryYear === preferences.deliveryYear;
    const hasPrice = unit.priceCents !== undefined || unit.priceLowCents !== undefined;
    const score = (tier === "preferred-region" ? 60 : tier === "preferred-typology" ? 45 : 25)
      + (typologyMatch ? 20 : 0) + (yearMatch ? 15 : 0) + (hasPrice ? 5 : 0);
    return { unit, score, tier, reasons, mismatches };
  });
};
