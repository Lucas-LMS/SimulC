import type { PortfolioUnit } from "../data/portfolio";

export const CATALOG_REGIONS = ["Zona Norte", "Zona Sudoeste", "Zona Oeste", "Porto Maravilha/Centro", "Niterói"] as const;
export type CatalogRegion = (typeof CATALOG_REGIONS)[number];
export const NO_DELIVERY_YEAR = "Sem ano";
export type TypologyClass = "Studio" | "Double Studio" | "1 quarto" | "2 quartos" | "3 quartos" | "4+" | "Outros";

const WEST_NEIGHBORHOODS = /\b(recreio|vargem(?: grande| pequena)?|campo grande|guaratiba|pontal)\b/i;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function classifyRegion(unit: Pick<PortfolioUnit, "region" | "neighborhood">): CatalogRegion {
  if (normalize(unit.neighborhood).includes("sao cristovao")) return "Zona Norte";
  if (unit.region === "Sudoeste/Oeste") {
    return unit.neighborhood.trim().toLocaleLowerCase("pt-BR") === "zona oeste" || WEST_NEIGHBORHOODS.test(unit.neighborhood)
      ? "Zona Oeste"
      : "Zona Sudoeste";
  }
  if (unit.region === "Porto/Centro") return "Porto Maravilha/Centro";
  return unit.region;
}

export function deliveryYears(unit: Pick<PortfolioUnit, "deliveryYear" | "deliveryText">): number[] {
  if (unit.deliveryYear) return [unit.deliveryYear];
  const years = (unit.deliveryText.match(/\b20\d{2}\b/g) ?? []).map(Number);
  return [...new Set(years)].sort((a, b) => a - b);
}

export function classifyTypology(unit: Pick<PortfolioUnit, "typology" | "bedrooms">): TypologyClass {
  const text = normalize(unit.typology);
  if (/\bdouble\s+studio\b/.test(text)) return "Double Studio";
  if (/\bstudio\b/.test(text)) return "Studio";
  const bedroomCount = unit.bedrooms ?? Number(text.match(/\b([1-9])\s*q\b/)?.[1]);
  if (bedroomCount === 1) return "1 quarto";
  if (bedroomCount === 2) return "2 quartos";
  if (bedroomCount === 3) return "3 quartos";
  if (bedroomCount && bedroomCount >= 4) return "4+";
  return "Outros";
}

export function presentTypologyClasses(units: readonly PortfolioUnit[]): TypologyClass[] {
  const order: TypologyClass[] = ["Studio", "Double Studio", "1 quarto", "2 quartos", "3 quartos", "4+", "Outros"];
  const present = new Set(units.map(classifyTypology));
  return order.filter((item) => present.has(item));
}

export function presentDeliveryYears(units: readonly PortfolioUnit[]): (number | typeof NO_DELIVERY_YEAR)[] {
  const years = new Set<number>();
  let hasNoYear = false;
  for (const unit of units) {
    const found = deliveryYears(unit);
    if (!found.length) hasNoYear = true;
    found.forEach((year) => years.add(year));
  }
  const result: (number | typeof NO_DELIVERY_YEAR)[] = [...years].sort((a, b) => a - b);
  if (hasNoYear) result.push(NO_DELIVERY_YEAR);
  return result;
}

export interface CatalogFilters {
  project?: string;
  year?: number | typeof NO_DELIVERY_YEAR;
  typology?: TypologyClass;
  region?: CatalogRegion;
}

export function filterCatalog(units: readonly PortfolioUnit[], filters: CatalogFilters): PortfolioUnit[] {
  const projectQuery = filters.project?.trim().toLocaleLowerCase("pt-BR");
  return units.filter((unit) => {
    if (projectQuery && !unit.project.toLocaleLowerCase("pt-BR").includes(projectQuery)) return false;
    if (filters.region && classifyRegion(unit) !== filters.region) return false;
    if (filters.typology && classifyTypology(unit) !== filters.typology) return false;
    if (filters.year !== undefined) {
      const years = deliveryYears(unit);
      if (filters.year === NO_DELIVERY_YEAR ? years.length !== 0 : !years.includes(filters.year)) return false;
    }
    return true;
  });
}
