/** The fund title names the budget year (for example, "Novus 2025"). */
export type FundYearSource = { id: string; title: string; occurred_on: string };
export type FundedExpenseDate = { occurred_on: string; funding_fund_id: string | null };

function dateYear(date: string): string | null {
  const year = date?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? year : null;
}

/** A fund without a year in its title uses its receipt year. */
export function fundYear(fund: Pick<FundYearSource, "title" | "occurred_on">): string | null {
  const namedYear = fund.title.trim().match(/(?:^|\s)(\d{4})$/)?.[1];
  return namedYear ?? dateYear(fund.occurred_on);
}

/** A sourced cost belongs to its fund's year, even when incurred later. */
export function expenseYear(
  expense: FundedExpenseDate,
  fundsById: ReadonlyMap<string, FundYearSource>,
): string | null {
  const fund = expense.funding_fund_id ? fundsById.get(expense.funding_fund_id) : null;
  return fund ? fundYear(fund) ?? dateYear(expense.occurred_on) : dateYear(expense.occurred_on);
}
