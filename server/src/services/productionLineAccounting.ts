type AccountLike = {
  id: number;
  accountNumber: string | null;
  accountName: string;
};

type RevenueMapLike = {
  productionLine: string;
  revenueAccountId: number | null;
  revenueAccountNumber: string | null;
  active: boolean;
};

export const PRODUCT_REVENUE_PARENT_ACCOUNT = '41000';

export const DEFAULT_REVENUE_ACCOUNT_BY_PRODUCTION_LINE: Record<string, string> = {
  P1: '41010',
  P2: '41020',
  P3: '41030',
};

export function normalizeProductionLine(value: unknown): string {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || 'MIGRATION_REVIEW';
}

export function buildRevenueDimensionTags(productionLineValue: unknown) {
  const productionLine = normalizeProductionLine(productionLineValue);
  const revenueAccountNumber =
    DEFAULT_REVENUE_ACCOUNT_BY_PRODUCTION_LINE[productionLine] ||
    PRODUCT_REVENUE_PARENT_ACCOUNT;

  return {
    accountingClass: productionLine,
    revenueAccountFamily: PRODUCT_REVENUE_PARENT_ACCOUNT,
    revenueAccountNumber,
    revenueAccountType: 'production_line_revenue',
  };
}

export function resolveRevenueAccountForProductionLine({
  productionLine: productionLineValue,
  accounts,
  revenueMaps,
  fallbackRevenueAccount,
}: {
  productionLine: unknown;
  accounts: AccountLike[];
  revenueMaps: RevenueMapLike[];
  fallbackRevenueAccount: AccountLike;
}): AccountLike {
  const productionLine = normalizeProductionLine(productionLineValue);
  const activeMap = revenueMaps.find(
    (map) => map.active && normalizeProductionLine(map.productionLine) === productionLine
  );

  if (activeMap?.revenueAccountId) {
    const mappedById = accounts.find((account) => account.id === activeMap.revenueAccountId);
    if (mappedById) return mappedById;
  }

  if (activeMap?.revenueAccountNumber) {
    const mappedByNumber = accounts.find(
      (account) => account.accountNumber === activeMap.revenueAccountNumber
    );
    if (mappedByNumber) return mappedByNumber;
  }

  const defaultAccountNumber = DEFAULT_REVENUE_ACCOUNT_BY_PRODUCTION_LINE[productionLine];
  if (defaultAccountNumber) {
    const defaultAccount = accounts.find(
      (account) => account.accountNumber === defaultAccountNumber
    );
    if (defaultAccount) return defaultAccount;
  }

  return fallbackRevenueAccount;
}
