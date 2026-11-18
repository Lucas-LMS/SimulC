import type { PortfolioUnit } from "../data/portfolio";
import type { PaymentDate } from "./models";

/** Persiste a data digitada no simulador mantendo a descrição e as observações originais da fonte. */
export const recordSimulationDelivery = (unit: PortfolioUnit, date: PaymentDate): PortfolioUnit => ({
  ...unit,
  deliveryYear: date.year,
  deliveryMonth: date.month,
  deliveryDateSource: "simulation",
});
