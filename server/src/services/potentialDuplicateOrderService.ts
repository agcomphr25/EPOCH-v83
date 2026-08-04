import { sql } from 'drizzle-orm';

import { db, pool } from '../../db';
import { potentialOrderDuplicateReviews } from '../../schema';

export const DUPLICATE_REVIEW_RESOLUTION_CODES = [
  'INTENDED_ADDITIONAL_STOCK',
  'MULTIPLE_STOCKS_SAME_ORDER',
  'REORDER_AFTER_RECEIPT',
  'REPLACEMENT_REBUILD',
  'DIFFERENT_CUSTOMER',
  'UNNECESSARY_DUPLICATE',
  'CUSTOMER_CONFIRMATION_NEEDED',
] as const;

export type DuplicateReviewResolutionCode =
  (typeof DUPLICATE_REVIEW_RESOLUTION_CODES)[number];

export type DuplicateOrderInput = {
  orderId: string;
  customerId?: string | null;
  customerName?: string | null;
  modelId?: string | null;
  features?: Record<string, unknown> | null;
  handedness?: string | null;
  isFlattop?: boolean | null;
  isReplacement?: boolean | null;
  replacedOrderId?: string | null;
};

export type DuplicateIdentity = {
  customerId?: string | null;
  customerName?: string | null;
  email?: string | null;
  phone?: string | null;
  addresses?: Array<Record<string, unknown>> | null;
};

export type DuplicateCandidateRecord = DuplicateIdentity & {
  orderId: string;
  orderDate: Date | string;
  status?: string | null;
  currentDepartment?: string | null;
  modelId?: string | null;
  features?: Record<string, unknown> | null;
  handedness?: string | null;
  isFlattop?: boolean | null;
  isCancelled?: boolean | null;
  isReplacement?: boolean | null;
  replacedOrderId?: string | null;
};

export type DuplicateMatchSignal = {
  code: string;
  label: string;
  points: number;
};
export type DuplicateConfigurationDifference = {
  field: string;
  incoming: unknown;
  candidate: unknown;
};

export type PotentialDuplicateCandidate = {
  candidateOrderId: string;
  candidateCustomerId: string | null;
  candidateCustomerName: string | null;
  orderDate: Date | string;
  status: string | null;
  currentDepartment: string | null;
  modelId: string | null;
  riskScore: number;
  riskLevel: 'MEDIUM' | 'HIGH';
  matchedSignals: DuplicateMatchSignal[];
  configurationDifferences: DuplicateConfigurationDifference[];
};

const FIRST_NAME_ALIASES = [
  ['jim', 'james', 'jimmy'],
  ['bob', 'robert', 'bobby'],
  ['bill', 'william', 'will'],
  ['mike', 'michael'],
  ['dick', 'richard', 'rick'],
  ['tom', 'thomas'],
  ['joe', 'joseph'],
  ['dan', 'daniel'],
  ['chris', 'christopher'],
  ['steve', 'stephen', 'steven'],
] as const;

function normalizedText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizedPhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizedAddress(value: Record<string, unknown>): string {
  return [
    value.street,
    value.street2,
    value.city,
    value.state,
    value.zipCode ?? value.zip_code,
  ]
    .map(normalizedText)
    .filter(Boolean)
    .join('|');
}

function namesAreAliases(left: unknown, right: unknown): boolean {
  const leftParts = String(left ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const rightParts = String(right ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (leftParts.length < 2 || rightParts.length < 2) return false;
  if (normalizedText(leftParts.at(-1)) !== normalizedText(rightParts.at(-1)))
    return false;
  const leftFirst = normalizedText(leftParts[0]);
  const rightFirst = normalizedText(rightParts[0]);
  if (leftFirst === rightFirst) return true;
  return FIRST_NAME_ALIASES.some(
    (group) =>
      (group as readonly string[]).includes(leftFirst) &&
      (group as readonly string[]).includes(rightFirst)
  );
}

function featureValue(
  order: DuplicateOrderInput | DuplicateCandidateRecord,
  keys: string[]
): unknown {
  const features = order.features || {};
  for (const key of keys) {
    const direct = (order as Record<string, unknown>)[key];
    if (direct !== undefined && direct !== null && direct !== '') return direct;
    const nested = features[key];
    if (nested !== undefined && nested !== null && nested !== '') return nested;
  }
  return null;
}

const CORE_CONFIGURATION_FIELDS = [
  { field: 'handedness', label: 'handedness', keys: ['handedness'] },
  {
    field: 'actionLength',
    label: 'action length',
    keys: ['action_length', 'actionLength'],
  },
  {
    field: 'actionInlet',
    label: 'action inlet',
    keys: ['action_inlet', 'actionInlet'],
  },
  {
    field: 'bottomMetal',
    label: 'bottom metal',
    keys: ['bottom_metal', 'bottomMetal'],
  },
] as const;

const COMPARISON_FIELDS = [
  ...CORE_CONFIGURATION_FIELDS,
  {
    field: 'barrelInlet',
    label: 'barrel inlet',
    keys: ['barrel_inlet', 'barrelInlet'],
  },
  {
    field: 'paint',
    label: 'paint',
    keys: ['paint_options', 'paint', 'paintOption'],
  },
  { field: 'texture', label: 'texture', keys: ['texture'] },
  { field: 'shank', label: 'shank', keys: ['shank_value', 'shankLength'] },
] as const;

export function scorePotentialDuplicateOrder(
  incoming: DuplicateOrderInput & DuplicateIdentity,
  candidate: DuplicateCandidateRecord,
  now = new Date()
): PotentialDuplicateCandidate | null {
  if (
    !incoming.modelId ||
    normalizedText(incoming.modelId) !== normalizedText(candidate.modelId)
  )
    return null;
  if (
    incoming.replacedOrderId === candidate.orderId ||
    (incoming.isReplacement && incoming.replacedOrderId)
  )
    return null;

  const matchedSignals: DuplicateMatchSignal[] = [
    { code: 'SAME_STOCK_MODEL', label: 'Same stock model', points: 25 },
  ];

  if (incoming.customerId && incoming.customerId === candidate.customerId) {
    matchedSignals.push({
      code: 'SAME_CUSTOMER_ID',
      label: 'Same customer record',
      points: 45,
    });
  } else {
    if (
      normalizedText(incoming.email) &&
      normalizedText(incoming.email) === normalizedText(candidate.email)
    ) {
      matchedSignals.push({
        code: 'SAME_EMAIL',
        label: 'Same customer email',
        points: 35,
      });
    }
    if (
      normalizedPhone(incoming.phone) &&
      normalizedPhone(incoming.phone) === normalizedPhone(candidate.phone)
    ) {
      matchedSignals.push({
        code: 'SAME_PHONE',
        label: 'Same customer phone',
        points: 30,
      });
    }
    const incomingAddresses = (incoming.addresses || [])
      .map(normalizedAddress)
      .filter(Boolean);
    const candidateAddresses = new Set(
      (candidate.addresses || []).map(normalizedAddress).filter(Boolean)
    );
    if (incomingAddresses.some((address) => candidateAddresses.has(address))) {
      matchedSignals.push({
        code: 'SAME_ADDRESS',
        label: 'Same customer address',
        points: 25,
      });
    }
    if (namesAreAliases(incoming.customerName, candidate.customerName)) {
      matchedSignals.push({
        code: 'CUSTOMER_NAME_ALIAS',
        label: 'Customer names appear equivalent',
        points: 15,
      });
    }
  }

  const hasCustomerIdentitySignal = matchedSignals.some((signal) =>
    [
      'SAME_CUSTOMER_ID',
      'SAME_EMAIL',
      'SAME_PHONE',
      'SAME_ADDRESS',
      'CUSTOMER_NAME_ALIAS',
    ].includes(signal.code)
  );
  if (!hasCustomerIdentitySignal) return null;

  for (const definition of CORE_CONFIGURATION_FIELDS) {
    const left = featureValue(incoming, [...definition.keys]);
    const right = featureValue(candidate, [...definition.keys]);
    if (
      normalizedText(left) &&
      normalizedText(left) === normalizedText(right)
    ) {
      matchedSignals.push({
        code: `SAME_${definition.field.replace(/([A-Z])/g, '_$1').toUpperCase()}`,
        label: `Same ${definition.label}`,
        points: 4,
      });
    }
  }

  if (Boolean(incoming.isFlattop) === Boolean(candidate.isFlattop)) {
    matchedSignals.push({
      code: 'SAME_FLATTOP_STATE',
      label: 'Same flattop state',
      points: 4,
    });
  }

  const normalizedStatus = normalizedText(candidate.status);
  const normalizedDepartment = normalizedText(candidate.currentDepartment);
  const isActive =
    !['fulfilled', 'shipped', 'cancelled', 'scrapped'].includes(
      normalizedStatus
    ) && !['fulfilled', 'shipped'].includes(normalizedDepartment);
  if (isActive) {
    matchedSignals.push({
      code: 'EXISTING_ACTIVE_ORDER',
      label: 'Existing order is still active',
      points: 20,
    });
  } else if (
    ['fulfilled', 'shipped'].includes(normalizedStatus) ||
    ['fulfilled', 'shipped'].includes(normalizedDepartment)
  ) {
    const ageMs = now.getTime() - new Date(candidate.orderDate).getTime();
    if (ageMs <= 730 * 24 * 60 * 60 * 1000) {
      matchedSignals.push({
        code: 'RECENTLY_FULFILLED',
        label: 'Fulfilled within the last 24 months',
        points: 10,
      });
    }
  }

  const riskScore = Math.min(
    100,
    matchedSignals.reduce((sum, signal) => sum + signal.points, 0)
  );
  if (riskScore < 65) return null;

  const configurationDifferences = COMPARISON_FIELDS.flatMap((definition) => {
    const left = featureValue(incoming, [...definition.keys]);
    const right = featureValue(candidate, [...definition.keys]);
    if (normalizedText(left) === normalizedText(right)) return [];
    return [{ field: definition.label, incoming: left, candidate: right }];
  });

  return {
    candidateOrderId: candidate.orderId,
    candidateCustomerId: candidate.customerId ?? null,
    candidateCustomerName: candidate.customerName ?? null,
    orderDate: candidate.orderDate,
    status: candidate.status ?? null,
    currentDepartment: candidate.currentDepartment ?? null,
    modelId: candidate.modelId ?? null,
    riskScore,
    riskLevel: riskScore >= 85 ? 'HIGH' : 'MEDIUM',
    matchedSignals,
    configurationDifferences,
  };
}

export async function findPotentialDuplicateOrders(
  input: DuplicateOrderInput
): Promise<PotentialDuplicateCandidate[]> {
  if (!input.modelId) return [];
  const identityResult = await pool.query(
    `SELECT c.id::text AS "customerId", c.name AS "customerName", c.email, c.phone,
            COALESCE(json_agg(json_build_object('street', ca.street, 'street2', ca.street2, 'city', ca.city,
              'state', ca.state, 'zipCode', ca.zip_code)) FILTER (WHERE ca.id IS NOT NULL), '[]'::json) AS addresses
       FROM customers c
       LEFT JOIN customer_addresses ca ON ca.customer_id = c.id
      WHERE c.id::text = $1
      GROUP BY c.id, c.name, c.email, c.phone`,
    [input.customerId || '']
  );
  const identity: DuplicateIdentity = identityResult.rows[0] || {
    customerId: input.customerId,
    customerName: input.customerName,
    addresses: [],
  };

  const candidatesResult = await pool.query(
    `SELECT ao.order_id AS "orderId", ao.order_date AS "orderDate", ao.status,
            ao.current_department AS "currentDepartment", ao.customer_id AS "customerId",
            c.name AS "customerName", c.email, c.phone, ao.model_id AS "modelId",
            ao.features, ao.handedness, ao.is_flattop AS "isFlattop",
            ao.is_cancelled AS "isCancelled", ao.is_replacement AS "isReplacement",
            ao.replaced_order_id AS "replacedOrderId",
            COALESCE(json_agg(json_build_object('street', ca.street, 'street2', ca.street2, 'city', ca.city,
              'state', ca.state, 'zipCode', ca.zip_code)) FILTER (WHERE ca.id IS NOT NULL), '[]'::json) AS addresses
       FROM all_orders ao
       LEFT JOIN customers c ON c.id::text = ao.customer_id
       LEFT JOIN customer_addresses ca ON ca.customer_id = c.id
      WHERE LOWER(TRIM(COALESCE(ao.model_id, ''))) = LOWER(TRIM($1))
        AND ao.order_id <> $2
        AND ao.order_date >= CURRENT_DATE - INTERVAL '24 months'
        AND COALESCE(ao.is_cancelled, false) = false
        AND ao.scrap_date IS NULL
        AND UPPER(COALESCE(ao.status, '')) NOT IN ('CANCELLED', 'SCRAPPED')
      GROUP BY ao.id, c.id, c.name, c.email, c.phone
      ORDER BY ao.order_date DESC
      LIMIT 100`,
    [input.modelId, input.orderId]
  );

  return candidatesResult.rows
    .map((candidate) =>
      scorePotentialDuplicateOrder({ ...input, ...identity }, candidate)
    )
    .filter((candidate): candidate is PotentialDuplicateCandidate =>
      Boolean(candidate)
    )
    .sort(
      (a, b) =>
        b.riskScore - a.riskScore ||
        new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
    )
    .slice(0, 10);
}

export async function recordPotentialDuplicateReviews({
  newOrderId,
  candidates,
  resolution,
  actor,
}: {
  newOrderId: string;
  candidates: PotentialDuplicateCandidate[];
  resolution?: {
    code: DuplicateReviewResolutionCode;
    note?: string | null;
  } | null;
  actor?: { id?: number | null; displayName?: string | null } | null;
}) {
  if (candidates.length === 0) return [];
  const now = new Date();
  return db
    .insert(potentialOrderDuplicateReviews)
    .values(
      candidates.map((candidate) => ({
        newOrderId,
        candidateOrderId: candidate.candidateOrderId,
        riskScore: candidate.riskScore,
        riskLevel: candidate.riskLevel,
        matchedSignals: candidate.matchedSignals,
        configurationDifferences: candidate.configurationDifferences,
        status: resolution ? 'RESOLVED' : 'PENDING',
        resolutionCode: resolution?.code ?? null,
        resolutionNote: resolution?.note?.trim() || null,
        reviewedByUserId: resolution ? (actor?.id ?? null) : null,
        reviewedByDisplayName: resolution ? (actor?.displayName ?? null) : null,
        reviewedAt: resolution ? now : null,
        detectedAt: now,
        updatedAt: now,
      }))
    )
    .onConflictDoUpdate({
      target: [
        potentialOrderDuplicateReviews.newOrderId,
        potentialOrderDuplicateReviews.candidateOrderId,
      ],
      set: {
        riskScore: sql`excluded.risk_score`,
        riskLevel: sql`excluded.risk_level`,
        matchedSignals: sql`excluded.matched_signals`,
        configurationDifferences: sql`excluded.configuration_differences`,
        status: sql`excluded.status`,
        resolutionCode: sql`excluded.resolution_code`,
        resolutionNote: sql`excluded.resolution_note`,
        reviewedByUserId: sql`excluded.reviewed_by_user_id`,
        reviewedByDisplayName: sql`excluded.reviewed_by_display_name`,
        reviewedAt: sql`excluded.reviewed_at`,
        detectedAt: sql`excluded.detected_at`,
        updatedAt: now,
      },
    })
    .returning();
}
