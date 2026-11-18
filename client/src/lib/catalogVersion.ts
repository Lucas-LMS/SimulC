import type { PortfolioUnit } from "../data/portfolio";

export interface CatalogCandidateKey {
  project?: string;
  typology?: string;
  neighborhood?: string;
  bedrooms?: number;
  parking?: boolean | "unknown";
}

export const normalizeCatalogKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
export const normalizeCatalogTypology = (value: string) => normalizeCatalogKey(value)
  .replace(/\b(\d+)\s+quartos?\b/g, "$1q")
  .replace(/\bc\s+vaga\b/g, "com vaga")
  .replace(/\bs\s+vaga\b/g, "sem vaga");
const roomsFrom = (value: string) => Number(value.match(/\b(\d)\s*(?:q|quarto)/i)?.[1] ?? 0) || null;
const parkingFrom = (value: string): boolean | null => /sem\s+vaga|s\/\s*vaga/i.test(value) ? false : /com\s+vaga|c\/\s*vaga/i.test(value) ? true : null;

/** Same project plus same explicit variant, or an ambiguous shortlist based on bedrooms/parking. */
export const findCatalogVersionMatches = (portfolio: PortfolioUnit[], candidate: CatalogCandidateKey): PortfolioUnit[] => {
  const project = normalizeCatalogKey(candidate.project ?? "");
  if (!project) return [];
  const sameProject = portfolio.filter((unit) => normalizeCatalogKey(unit.project) === project);
  const typology = normalizeCatalogTypology(candidate.typology ?? "");
  const exactVariant = typology ? sameProject.filter((unit) => normalizeCatalogTypology(unit.typology) === typology) : [];
  if (exactVariant.length) return exactVariant;

  const bedrooms = candidate.bedrooms ?? roomsFrom(candidate.typology ?? "");
  const parking = candidate.parking === "unknown" ? null : candidate.parking ?? parkingFrom(candidate.typology ?? "");
  return sameProject.filter((unit) => {
    const existingBedrooms = unit.bedrooms ?? roomsFrom(unit.typology);
    const existingParking = unit.parking === "unknown" ? null : unit.parking ?? parkingFrom(unit.typology);
    return (bedrooms === null || existingBedrooms === null || bedrooms === existingBedrooms)
      && (parking === null || existingParking === null || parking === existingParking);
  });
};

export const compareTableDates = (existingDate: string, incomingDate: string): "newer" | "same" | "older" | "unknown" => {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  };
  if (!valid(existingDate) || !valid(incomingDate)) return "unknown";
  return incomingDate > existingDate ? "newer" : incomingDate < existingDate ? "older" : "same";
};
