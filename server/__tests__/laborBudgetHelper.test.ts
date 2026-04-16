import { describe, it, expect, vi, beforeEach } from 'vitest';

interface SelectLimitChain { limit: (n: number) => Promise<Record<string, unknown>[]> }
interface SelectWhereChain { where: (cond: unknown) => SelectLimitChain }
interface SelectFromChain { from: (table: unknown) => SelectWhereChain }

vi.mock('../db', () => ({
  db: { select: vi.fn<() => SelectFromChain>() },
}));

vi.mock('../storage', () => ({
  storage: {
    getLaborHoursByWorkOrder: vi.fn<(id: string) => Promise<number>>(),
    getLaborHoursByWorkOrderAndDepartment: vi.fn<(id: string, dept: string) => Promise<number>>(),
  },
}));

vi.mock('../schema', () => ({
  productionWorkOrders: {},
}));

import { evaluateWorkOrderLaborStatus } from '../src/helpers/laborBudgetHelper';
import { db } from '../db';
import { storage } from '../storage';

function mockDbQuery(workOrder: Record<string, unknown> | null): void {
  const rows = workOrder ? [workOrder] : [];
  const limitFn = vi.fn<() => Promise<Record<string, unknown>[]>>().mockResolvedValue(rows);
  const whereFn = vi.fn<() => SelectLimitChain>().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn<() => SelectWhereChain>().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn });
}

const WORK_ORDER_ID = '00000000-0000-0000-0000-000000000001';

describe('evaluateWorkOrderLaborStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when no budget is configured', () => {
    it('returns OK with null percentages when work order has no totalBudgetHours', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: null, departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(10);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('OK');
      expect(result.totalHours).toBe(10);
      expect(result.totalBudget).toBeNull();
      expect(result.percentUsed).toBeNull();
    });

    it('returns OK when work order is not found', async () => {
      mockDbQuery(null);
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(0);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('OK');
      expect(result.totalBudget).toBeNull();
    });
  });

  describe('OK status', () => {
    it('returns OK when hours are well below 80% of budget', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '100', departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(50);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('OK');
      expect(result.totalHours).toBe(50);
      expect(result.totalBudget).toBe(100);
      expect(result.percentUsed).toBe(50);
    });

    it('returns OK when hours are exactly at 79% of budget', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '100', departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(79);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('OK');
      expect(result.percentUsed).toBe(79);
    });
  });

  describe('WARNING status', () => {
    it('returns WARNING when hours are at exactly 80% of budget', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '100', departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(80);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('WARNING');
      expect(result.percentUsed).toBe(80);
    });

    it('returns WARNING when hours are between 80% and 99% of budget', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '100', departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(90);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('WARNING');
      expect(result.percentUsed).toBe(90);
    });

    it('returns WARNING when hours are at 99% of budget', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '100', departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(99);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('WARNING');
    });
  });

  describe('BLOCKED status', () => {
    it('returns BLOCKED when hours equal 100% of budget', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '100', departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(100);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('BLOCKED');
      expect(result.percentUsed).toBe(100);
    });

    it('returns BLOCKED when hours exceed 100% of budget', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '100', departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(120);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.status).toBe('BLOCKED');
      expect(result.percentUsed).toBe(120);
    });
  });

  describe('department budget enforcement', () => {
    it('returns OK when no department budget is configured for that department', async () => {
      mockDbQuery({
        id: WORK_ORDER_ID,
        totalBudgetHours: '100',
        departmentBudgets: { WELD: 20 },
      });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(50);
      vi.mocked(storage.getLaborHoursByWorkOrderAndDepartment).mockResolvedValue(5);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID, 'MACHINE');

      expect(result.departmentBudget).toBeNull();
      expect(result.departmentPercentUsed).toBeNull();
      expect(result.status).toBe('OK');
    });

    it('returns WARNING driven by department budget even if total is OK', async () => {
      mockDbQuery({
        id: WORK_ORDER_ID,
        totalBudgetHours: '200',
        departmentBudgets: { WELD: 10 },
      });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(50);
      vi.mocked(storage.getLaborHoursByWorkOrderAndDepartment).mockResolvedValue(9);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID, 'WELD');

      expect(result.status).toBe('WARNING');
      expect(result.departmentBudget).toBe(10);
      expect(result.departmentHours).toBe(9);
      expect(result.departmentPercentUsed).toBe(90);
    });

    it('returns BLOCKED driven by department budget even if total is below threshold', async () => {
      mockDbQuery({
        id: WORK_ORDER_ID,
        totalBudgetHours: '200',
        departmentBudgets: { WELD: 10 },
      });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(50);
      vi.mocked(storage.getLaborHoursByWorkOrderAndDepartment).mockResolvedValue(10);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID, 'WELD');

      expect(result.status).toBe('BLOCKED');
      expect(result.departmentPercentUsed).toBe(100);
    });

    it('returns BLOCKED driven by total budget even when department is OK', async () => {
      mockDbQuery({
        id: WORK_ORDER_ID,
        totalBudgetHours: '100',
        departmentBudgets: { WELD: 50 },
      });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(100);
      vi.mocked(storage.getLaborHoursByWorkOrderAndDepartment).mockResolvedValue(10);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID, 'WELD');

      expect(result.status).toBe('BLOCKED');
      expect(result.percentUsed).toBe(100);
    });

    it('uses the worst status when both total and department are in different states', async () => {
      mockDbQuery({
        id: WORK_ORDER_ID,
        totalBudgetHours: '100',
        departmentBudgets: { WELD: 20 },
      });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(85);
      vi.mocked(storage.getLaborHoursByWorkOrderAndDepartment).mockResolvedValue(21);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID, 'WELD');

      expect(result.status).toBe('BLOCKED');
    });
  });

  describe('return value shape', () => {
    it('includes all required fields', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '100', departmentBudgets: { PAINT: 30 } });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(85);
      vi.mocked(storage.getLaborHoursByWorkOrderAndDepartment).mockResolvedValue(25);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID, 'PAINT');

      expect(result).toMatchObject({
        totalHours: 85,
        departmentHours: 25,
        totalBudget: 100,
        departmentBudget: 30,
        status: 'WARNING',
      });
      expect(typeof result.percentUsed).toBe('number');
      expect(typeof result.departmentPercentUsed).toBe('number');
    });

    it('rounds percentUsed to two decimal places', async () => {
      mockDbQuery({ id: WORK_ORDER_ID, totalBudgetHours: '3', departmentBudgets: null });
      vi.mocked(storage.getLaborHoursByWorkOrder).mockResolvedValue(1);

      const result = await evaluateWorkOrderLaborStatus(WORK_ORDER_ID);

      expect(result.percentUsed).toBeCloseTo(33.33, 1);
    });
  });
});
