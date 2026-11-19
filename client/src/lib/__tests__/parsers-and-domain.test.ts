import { describe, expect, it } from "vitest";
import { parseGpmText } from "../gpm";
import { parseLeadForm, recommendUnitsForLead } from "../leads";
import { projectClientPriceProfile } from "../clientPriceProfile";
import { buildInternalSummary, generateWhatsAppMessage } from "../whatsapp";
import { calculateAll } from "../calculator";
import { sanitizeWorkspace } from "../storage";
import { extractCandidates, reconstructPdfText } from "../importFiles";
import { isSafeRasterImageMime } from "../clipboard";
import { initialPortfolio } from "../../data/portfolio";

describe("parseGpmText", () => {
  it("does not multiply 360 meses by 12 when (30 anos) appears alongside it", () => {
    const parsed = parseGpmText(`
      Valor do imóvel: Tabela 2026 - R$ 320.000,00
      Valor do financiamento: R$ 256.000,00
      1ª parcela PRICE: R$ 2.150,50
      Prazo: 360 meses (30 anos)
      Linha: MCMV
      Sistema: PRICE
    `);
    expect(parsed.propertyPriceCents).toBe(320_000_00);
    expect(parsed.financingAmountCents).toBe(256_000_00);
    expect(parsed.firstInstallmentCents).toBe(2_150_50);
    expect(parsed.termMonths).toBe(360);
    expect(parsed.financingLine).toBe("Minha Casa, Minha Vida");
  });

  it("converts term in anos when explicitly given in years", () => {
    const parsed = parseGpmText("Prazo: 35 anos");
    expect(parsed.termMonths).toBe(420);
  });
});

describe("leads parsing & recommendations", () => {
  it("extracts accented inline answers accurately and excludes Vaga avulsa from recommendations", () => {
    const draft = parseLeadForm(
      [
        "Qual região mais interessa?: Recreio / Barra",
        "Quantos quartos?: 2 quartos com vaga",
        "Qual valor de FGTS disponível?: Não tenho",
        "Qual renda bruta familiar?: R$ 9.500,00",
        "Nome completo: João Pereira",
      ].join("\n"),
      new Date(2026, 10, 18),
    );
    expect(draft.name).toBe("João Pereira");
    expect(draft.fgtsBalanceCents).toBe(0);
    expect(draft.incomeFamilyCents).toBe(9_500_00);
    expect(draft.preferences.bedrooms).toBe(2);
    expect(draft.preferences.parking).toBe(true);

    const recs = recommendUnitsForLead(draft, initialPortfolio);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((r) => /vaga\s+avulsa/i.test(r.unit.typology))).toBe(false);
  });
});

describe("projectClientPriceProfile", () => {
  it("guards negative values and explains 80% cap without fabricating installment reduction", () => {
    const projection = projectClientPriceProfile(
      {
        priceReferenceCents: 300_000_00,
        financingAmountCents: 260_000_00,
        firstPriceInstallmentCents: 2_000_00,
        financingTermMonths: 360,
        updatedAt: "2026-11-18T00:00:00Z",
      },
      300_000_00,
    );
    expect(projection.financingCapped).toBe(true);
    expect(projection.financingAmountCents).toBe(240_000_00);
    expect(projection.firstPriceInstallmentCents).toBe(2_000_00);
    expect(projection.message).toContain("1ª parcela estimada segue proporcional");
  });
});

describe("whatsapp & internal summary", () => {
  it("uses brokerProfile, areaText fallback, consistent direct percents, and finalMonthlyCents", () => {
    const unit = {
      ...initialPortfolio[0],
      areaM2: undefined,
      areaText: "42 a 45 m²",
    };
    const calculation = calculateAll({
      priceCents: 300_000_00,
      incomeCents: 15_000_00,
      financingAmountCents: 240_000_00,
      firstPriceInstallmentCents: 2_100_00,
      actDate: { year: 2026, month: 11 },
      deliveryDate: { year: 2029, month: 6 },
      monthlyCount: 30,
      annualPayments: [{ id: "a1", year: 2027, month: 12, amountCents: null }],
      annualFactor: 3.5,
      robustActCents: 15_000_00,
      availableActCents: 20_000_00,
      directPrePercent: 52.5,
      includeDirect: true,
      actualShortFlowConfirmed: false,
    });

    const msg = generateWhatsAppMessage({
      client: null,
      property: unit,
      priceCents: 300_000_00,
      deliveryDate: { year: 2029, month: 6 },
      deliveryIsPremise: false,
      priceIsPremise: false,
      actDate: { year: 2026, month: 11 },
      deliveryText: "",
      monthsCount: 30,
      calculation,
      financingTermMonths: 360,
      financingLine: "MCMV",
      financingSystem: "PRICE",
      financingRate: "8%",
      firstPriceInstallmentCents: 2_100_00,
      incomeCents: 15_000_00,
      includeFGTSNote: false,
      mode: "ambas",
      brokerProfile: { name: "Ana Costa", creci: "CRECI-RJ 99999" },
    });

    expect(msg).toContain("*Ana Costa* (CRECI-RJ 99999)");
    expect(msg).toContain("42 a 45 m²");
    expect(msg).toContain("52,5%");
    expect(msg).toContain("47,5%");
    expect(msg).not.toContain("(53%");

    const summary = buildInternalSummary({
      client: null,
      property: unit,
      priceCents: 300_000_00,
      deliveryDate: { year: 2029, month: 6 },
      deliveryIsPremise: false,
      priceIsPremise: false,
      actDate: { year: 2026, month: 11 },
      deliveryText: "",
      monthsCount: 30,
      calculation,
      financingTermMonths: 360,
      financingLine: "MCMV",
      financingSystem: "PRICE",
      financingRate: "8%",
      firstPriceInstallmentCents: 2_100_00,
      incomeCents: 15_000_00,
      includeFGTSNote: false,
      mode: "ambas",
    });
    expect(summary).toContain("42 a 45 m²");
  });
});

describe("storage, PDF reconstruction, and security", () => {
  it("drops malformed entries when sanitizing workspace", () => {
    const clean = sanitizeWorkspace({
      clients: [null, {}, { id: "c1", name: "Valid" }],
      portfolio: [],
      simulations: [{ id: "bad" }, { id: "ok", actDate: { year: 2026, month: 11 } }],
      documents: [{ id: "d1", name: "doc.pdf" }, 123],
    });
    expect(clean.clients).toHaveLength(1);
    expect(clean.portfolio.length).toBeGreaterThan(0);
    expect(clean.simulations).toHaveLength(1);
    expect(clean.documents).toHaveLength(1);
  });

  it("reconstructs PDF text in stable row order and accepts prices above R$ 1M", () => {
    const text = reconstructPdfText([
      { str: "R$ 1.250.000,00", transform: [1, 0, 0, 1, 200, 100] },
      { str: "Cobertura", transform: [1, 0, 0, 1, 20, 101] },
      { str: "Título", transform: [1, 0, 0, 1, 20, 130] },
    ]);
    expect(text).toBe("Título\nCobertura R$ 1.250.000,00");
    const candidates = extractCandidates(text);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].priceCents).toBe(1_250_000_00);
  });

  it("blocks SVG MIME type to prevent local stored XSS", () => {
    expect(isSafeRasterImageMime("image/svg+xml")).toBe(false);
    expect(isSafeRasterImageMime("image/png")).toBe(true);
    expect(isSafeRasterImageMime("image/jpeg")).toBe(true);
  });
});
