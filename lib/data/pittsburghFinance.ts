import snapshot from "./snapshots/pittsburgh-finance-2026.json";

export interface PittsburghFinance {
  city: string;
  fiscalYear: number;
  totalRevenue: number;
  totalExpenditures: number;
  operatingResult: number;
  debtService: number;
  reserveBalance: null;
  reservePercentOfExpenditures: null;
  debtServicePercentOfExpenditures: number;
  source: typeof snapshot.source;
}

function validateAmount(value: unknown, field: string, allowNegative = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      Math.abs(value) > Number.MAX_SAFE_INTEGER || (!allowNegative && value < 0)) {
    throw new Error(`Invalid Pittsburgh finance snapshot: ${field} must be a finite USD amount${allowNegative ? "" : " greater than or equal to zero"}.`);
  }
  return value;
}

export function getPittsburghFinance(): PittsburghFinance {
  const totalRevenue = validateAmount(snapshot.totalRevenue, "totalRevenue");
  const totalExpenditures = validateAmount(snapshot.totalExpenditures, "totalExpenditures");
  const operatingResult = validateAmount(snapshot.operatingResult, "operatingResult", true);
  const debtService = validateAmount(snapshot.debtService, "debtService");

  if (totalExpenditures <= 0) {
    throw new Error("Invalid Pittsburgh finance snapshot: totalExpenditures must be greater than zero.");
  }
  if (debtService > totalExpenditures) {
    throw new Error("Invalid Pittsburgh finance snapshot: debtService exceeds totalExpenditures.");
  }
  if (snapshot.reserveBalance !== null || snapshot.reservePercentOfExpenditures !== null) {
    throw new Error("Invalid Pittsburgh finance snapshot: unverified reserve fields must remain null.");
  }

  return {
    ...structuredClone(snapshot),
    totalRevenue,
    totalExpenditures,
    operatingResult,
    debtService,
    reserveBalance: null,
    reservePercentOfExpenditures: null,
    debtServicePercentOfExpenditures: (debtService / totalExpenditures) * 100,
  };
}
