import { useId, useMemo, useState } from "react";
import type { PortfolioUnit } from "../data/portfolio";

interface Props {
  label: string;
  units: PortfolioUnit[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  emptyLabel?: string;
}

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const unitLabel = (unit: PortfolioUnit) => `${unit.project} · ${unit.typology} · ${unit.neighborhood || unit.region}`;

export default function SearchableUnitSelect({ label, units, value, onChange, className = "", emptyLabel = "Selecione uma unidade" }: Props) {
  const [query, setQuery] = useState("");
  const selectId = useId();
  const normalizedQuery = normalize(query);
  const matches = useMemo(() => {
    if (!normalizedQuery) return units;
    return units.filter((unit) => normalize(`${unit.project} ${unit.typology} ${unit.neighborhood} ${unit.region}`).includes(normalizedQuery));
  }, [normalizedQuery, units]);
  const selected = units.find((unit) => unit.id === value);
  const selectedIsMatch = !selected || matches.some((unit) => unit.id === selected.id);

  return (
    <div className={`form-field searchable-unit-select ${className}`.trim()}>
      <label className="searchable-unit-label" htmlFor={selectId}>{label}</label>
      <input
        className="unit-search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nome, tipologia, bairro ou região"
        aria-label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
        autoComplete="off"
      />
      <select
        id={selectId}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery("");
        }}
      >
        {!value && <option value="">{emptyLabel}</option>}
        {selected && !selectedIsMatch && <option value={selected.id} disabled>Atual: {unitLabel(selected)} (fora do filtro)</option>}
        {!matches.length && <option value="" disabled>Nenhum resultado para esta busca</option>}
        {matches.map((unit) => <option value={unit.id} key={unit.id}>{unitLabel(unit)}</option>)}
      </select>
      <small aria-live="polite">{normalizedQuery ? `${matches.length} resultado(s) de ${units.length} unidades` : `${units.length} unidade(s) disponíveis`}</small>
    </div>
  );
}
