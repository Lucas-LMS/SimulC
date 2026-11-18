import { parseMoneyInput } from "./money";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

const normalizeWithOffsets = (value: string) => {
  let normalized = "";
  const sourceOffsets: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const normalizedCharacter = value[index].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    normalized += normalizedCharacter;
    for (let offset = 0; offset < normalizedCharacter.length; offset += 1) sourceOffsets.push(index);
  }
  return { normalized, sourceOffsets };
};

const LABELS = /(?:valor\s+(?:(?:do|de|da)\s+)?(?:imovel|financiamento|financiado|credito|unidade|contrato|prestacao|parcela)|preco\s+(?:(?:do|de|da)\s+)?(?:imovel|unidade)|valor\s+de\s+venda|preco\s+de\s+venda|renda\s+(?:bruta\s+)?familiar|renda\s+comprovada|renda\s+bruta|montante\s+(?:financiado|do\s+credito)|financiamento(?:\s+(?:caixa|estimado|habitacional|bancario|bruto)){0,2}|1\s*(?:a|ª|º|o)?\s*(?:parcela|prestacao|encargo)(?:\s+(?:price|caixa|inicial|mensal|estimada))?|primeir[oa]\s+(?:parcela|prestacao|encargo)(?:\s+(?:price|caixa|inicial|estimada|do\s+financiamento))?|prestacao\s+(?:inicial|price|mensal\s+inicial)(?:\s+(?:price|estimada))?|parcela\s+(?:inicial|price)|prazo(?:\s*\/?\s*(?:em\s*)?(?:mes(?:es)?|anos?)|\s+(?:(?:do|da|de)\s+)?(?:financiamento|amortizacao|simulacao|contrato|total))?|quantidade\s+de\s+(?:parcelas|prestacoes)|numero\s+de\s+(?:parcelas|prestacoes)|periodo\s+de\s+financiamento|linha\s+de\s+credito|programa\s+habitacional|linha|sistema\s+de\s+amortizacao|sistema|taxa(?:\s+de\s+juros)?|juros\s+nominais|(?:valor\s+do\s+)?subsidio|taxas\s+e\s+encargos|encargos\s+totais|tarifas\s+e\s+encargos|tarifas|cota\s+(?:de\s+)?financiamento|percentual\s+financiado|cota|comprometimento\s+(?:de\s+renda)?|renda\s+comprometida)\b/gi;

const valueFor = (text: string, pattern: RegExp): string => {
  const { normalized, sourceOffsets } = normalizeWithOffsets(text);
  const matches = [...normalized.matchAll(pattern)];
  for (const match of matches) {
    const normalizedStart = (match.index ?? 0) + match[0].length;
    const nextLabel = LABELS.exec(normalized.slice(normalizedStart));
    LABELS.lastIndex = 0;
    const normalizedEnd = nextLabel ? normalizedStart + (nextLabel.index ?? 0) : normalized.length;
    const start = sourceOffsets[normalizedStart] ?? text.length;
    const end = sourceOffsets[normalizedEnd] ?? text.length;
    const value = text.slice(start, end).replace(/^\s*[:?\-–—=|•·,]*\s*/, "").trim();
    if (value) return value;
  }
  return "";
};

// Accepts Portuguese monetary forms but stops before ordinal labels / month units.
const numberFrom = (value: string): number | null => {
  const match = value.match(/(?:R\$\s*)?-?\s*(?:\d{1,3}(?:\.\d{3})+|\d{1,3}(?: \d{3})+|\d+)(?:,\d{1,2})?/i);
  return match ? parseMoneyInput(match[0]) : null;
};

const textOrNull = (value: string) => value.trim() || null;
const percentFrom = (value: string): number | null => {
  const match = value.match(/\d{1,3}(?:[,.]\d{1,2})?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export interface GpmSuggestions {
  propertyPriceCents: number | null; familyIncomeCents: number | null; financingAmountCents: number | null;
  firstInstallmentCents: number | null; termMonths: number | null; financingLine: string | null;
  financingSystem: string | null; rate: string | null; subsidyCents: number | null; fees: string | null;
  quotaPercent: number | null; incomeCommitmentPercent: number | null;
}

/** Only labelled GPM/PRICE fields are retained; raw OCR (including any CPF-like text) is discarded by the caller. */
export const parseGpmText = (text: string): GpmSuggestions => {
  const propertyPrice = valueFor(text, /(?:valor\s+(?:(?:do|de)\s+)?imovel|preco\s+(?:do\s+)?imovel|valor\s+de\s+venda|preco\s+de\s+venda|valor\s+da\s+unidade|valor\s+do\s+contrato)\b/gi);
  const income = valueFor(text, /(?:renda\s+(?:bruta\s+)?familiar|renda\s+comprovada|renda\s+bruta)\b/gi);
  const financing = valueFor(text, /(?:valor\s+(?:(?:do|de)\s+)?financiamento|valor\s+financiado|valor\s+(?:do\s+)?credito|montante\s+(?:financiado|do\s+credito)|financiamento(?:\s+(?:caixa|estimado|habitacional|bancario|bruto)){0,2})\b/gi);
  const firstInstallment = valueFor(text, /(?:1\s*(?:a|ª|º|o)?\s*(?:parcela|prestacao|encargo)(?:\s+(?:price|caixa|inicial|mensal|estimada))?|primeir[oa]\s+(?:parcela|prestacao|encargo)(?:\s+(?:price|caixa|inicial|estimada|do\s+financiamento))?|prestacao\s+(?:inicial|price|mensal\s+inicial)(?:\s+(?:price|estimada))?|(?:valor\s+(?:da\s+)?)?prestacao\s+(?:inicial|price)|parcela\s+(?:inicial|price)|valor\s+(?:da\s+)?parcela\s+price)\b/gi);
  const term = valueFor(text, /(?:prazo(?:\s+(?:(?:do|da|de)\s+)?(?:financiamento|amortizacao|simulacao|contrato|total))?|prazo\s*\/?\s*(?:em\s*)?(?:mes(?:es)?|anos?)|quantidade\s+de\s+(?:parcelas|prestacoes)|numero\s+de\s+(?:parcelas|prestacoes)|periodo\s+de\s+financiamento)\b/gi);
  const line = valueFor(text, /(?:linha\s+de\s+credito|programa\s+habitacional|linha)\b/gi);
  const system = valueFor(text, /(?:sistema\s+de\s+amortizacao|sistema)\b/gi);
  const rate = valueFor(text, /(?:taxa(?:\s+de\s+juros)?|juros\s+nominais)\b/gi);
  const subsidy = valueFor(text, /(?:valor\s+do\s+)?subsidio\b/gi);
  const fees = valueFor(text, /(?:taxas\s+e\s+encargos|encargos\s+totais|tarifas\s+e\s+encargos|tarifas)\b/gi);
  const quota = valueFor(text, /(?:cota\s+(?:de\s+)?financiamento|percentual\s+financiado|cota)\b/gi);
  const commitment = valueFor(text, /(?:comprometimento\s+(?:de\s+renda)?|renda\s+comprometida)\b/gi);
  const termMatch = normalize(term).match(/\d{1,4}/);
  const unit = /\bano?s?\b/.test(normalize(term)) ? 12 : 1;
  const rawLineValue = textOrNull(line);
  const normalizedLine = normalize(rawLineValue ?? "");
  const lineValue = normalizedLine.includes("mcmv") ? "Minha Casa, Minha Vida" : normalizedLine.includes("sbpe") ? "SBPE" : rawLineValue;
  const systemValue = textOrNull(system);
  const textAll = normalize(text);
  return {
    propertyPriceCents: numberFrom(propertyPrice), familyIncomeCents: numberFrom(income),
    financingAmountCents: numberFrom(financing), firstInstallmentCents: numberFrom(firstInstallment),
    termMonths: termMatch ? Number(termMatch[0]) * unit : null,
    financingLine: lineValue ?? (textAll.includes("mcmv") ? "MCMV" : textAll.includes("sbpe") ? "SBPE" : null),
    financingSystem: systemValue ?? (textAll.includes("price") ? "PRICE" : null),
    rate: textOrNull(rate), subsidyCents: numberFrom(subsidy), fees: textOrNull(fees),
    quotaPercent: percentFrom(quota), incomeCommitmentPercent: percentFrom(commitment),
  };
};
