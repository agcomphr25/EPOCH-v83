/**
 * Attention & State-Confidence Service
 * 
 * Provides utilities for:
 * - Computing staleness/attention risk levels
 * - Tracking entity views and confirmations
 * - Querying attention dashboard data
 * 
 * CORE PRINCIPLE: We measure awareness, confirmation, and staleness of state.
 * We do NOT measure effort (page clicks, time-on-page, mouse activity).
 */

import { db } from '../../db';
import { 
  tickets, 
  orders, 
  nonconformanceRecords, 
  kickbacks,
  productionDelays,
  stalenessConfig 
} from '../../schema';
import { eq, and, or, isNull, sql, desc, asc, inArray } from 'drizzle-orm';
import { auditService, AuditEntityType } from './auditService';

export type AttentionRiskLevel = 'low' | 'medium' | 'high' | null;

export interface AttentionMetrics {
  entityId: string;
  entityType: AuditEntityType;
  currentStatus: string;
  assignedUserId?: number | null;
  assignedUserIds?: number[] | null;
  lastConfirmedAt: Date | null;
  lastConfirmedByUserId: number | null;
  updatedAt: Date | null;
  attentionRisk: AttentionRiskLevel;
  hoursSinceConfirmation: number | null;
  hasSeenLatestUpdate: boolean;
  viewedBy: Record<string, string>;
}

interface StalenessThreshold {
  entityType: string;
  statusValue: string;
  hoursUntilLow: number;
  hoursUntilMedium: number;
  hoursUntilHigh: number;
}

// Default staleness thresholds - aligned with actual ticket status enum values
// Note: ticket statuses from schema: 'new', 'in_progress', 'waiting_on_customer', 'waiting_on_production', 'resolved', 'closed'
const DEFAULT_THRESHOLDS: Record<string, StalenessThreshold> = {
  'ticket:new': { entityType: 'ticket', statusValue: 'new', hoursUntilLow: 8, hoursUntilMedium: 24, hoursUntilHigh: 48 },
  'ticket:in_progress': { entityType: 'ticket', statusValue: 'in_progress', hoursUntilLow: 24, hoursUntilMedium: 48, hoursUntilHigh: 72 },
  'ticket:waiting_on_customer': { entityType: 'ticket', statusValue: 'waiting_on_customer', hoursUntilLow: 48, hoursUntilMedium: 96, hoursUntilHigh: 168 },
  'ticket:waiting_on_production': { entityType: 'ticket', statusValue: 'waiting_on_production', hoursUntilLow: 24, hoursUntilMedium: 48, hoursUntilHigh: 72 },
  'order:in_progress': { entityType: 'order', statusValue: 'in_progress', hoursUntilLow: 24, hoursUntilMedium: 72, hoursUntilHigh: 168 },
  'qc_item:Open': { entityType: 'qc_item', statusValue: 'Open', hoursUntilLow: 24, hoursUntilMedium: 48, hoursUntilHigh: 72 },
  'production_delay:ACTIVE': { entityType: 'production_delay', statusValue: 'ACTIVE', hoursUntilLow: 12, hoursUntilMedium: 24, hoursUntilHigh: 48 },
};

class AttentionStateService {
  private thresholdCache: Map<string, StalenessThreshold> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  private lastCacheRefresh = 0;

  /**
   * Get staleness threshold for entity type and status
   */
  async getThreshold(entityType: string, statusValue: string): Promise<StalenessThreshold> {
    const cacheKey = `${entityType}:${statusValue}`;
    
    // Refresh cache if stale
    if (Date.now() - this.lastCacheRefresh > this.cacheTTL) {
      await this.refreshThresholdCache();
    }
    
    return this.thresholdCache.get(cacheKey) || DEFAULT_THRESHOLDS[cacheKey] || {
      entityType,
      statusValue,
      hoursUntilLow: 24,
      hoursUntilMedium: 48,
      hoursUntilHigh: 72,
    };
  }

  private async refreshThresholdCache(): Promise<void> {
    try {
      const configs = await db.select().from(stalenessConfig).where(eq(stalenessConfig.isActive, true));
      this.thresholdCache.clear();
      for (const config of configs) {
        const key = `${config.entityType}:${config.statusValue}`;
        this.thresholdCache.set(key, {
          entityType: config.entityType,
          statusValue: config.statusValue,
          hoursUntilLow: config.hoursUntilLow,
          hoursUntilMedium: config.hoursUntilMedium,
          hoursUntilHigh: config.hoursUntilHigh,
        });
      }
      // Add defaults for any missing
      for (const [key, value] of Object.entries(DEFAULT_THRESHOLDS)) {
        if (!this.thresholdCache.has(key)) {
          this.thresholdCache.set(key, value);
        }
      }
      this.lastCacheRefresh = Date.now();
    } catch (error) {
      console.error('[AttentionState] Failed to refresh threshold cache:', error);
    }
  }

  /**
   * Compute attention risk level based on time since last confirmation
   */
  computeRiskLevel(
    lastConfirmedAt: Date | null,
    updatedAt: Date | null,
    threshold: StalenessThreshold
  ): AttentionRiskLevel {
    // Use the more recent of lastConfirmedAt or updatedAt as baseline
    const baselineDate = lastConfirmedAt || updatedAt;
    if (!baselineDate) return null;

    const hoursSince = (Date.now() - new Date(baselineDate).getTime()) / (1000 * 60 * 60);

    if (hoursSince >= threshold.hoursUntilHigh) return 'high';
    if (hoursSince >= threshold.hoursUntilMedium) return 'medium';
    if (hoursSince >= threshold.hoursUntilLow) return 'low';
    return null;
  }

  /**
   * Confirm entity state - updates lastConfirmedAt and logs audit event
   */
  async confirmEntityState(
    entityType: AuditEntityType,
    entityId: string,
    userId: number,
    username: string,
    confirmationNote?: string
  ): Promise<{ success: boolean; confirmedAt: string }> {
    const now = new Date();
    const confirmedAt = now.toISOString();

    // Update the appropriate table based on entity type
    switch (entityType) {
      case 'ticket':
        await db.update(tickets)
          .set({ 
            lastConfirmedAt: now, 
            lastConfirmedByUserId: userId,
            confirmationNote: confirmationNote || null,
            attentionRisk: null, // Reset risk on confirmation
          })
          .where(eq(tickets.id, entityId));
        break;
      case 'order':
        await db.update(orders)
          .set({ 
            lastConfirmedAt: now, 
            lastConfirmedByUserId: userId,
            confirmationNote: confirmationNote || null,
            attentionRisk: null,
          })
          .where(eq(orders.orderId, entityId));
        break;
      case 'qc_item':
        // QC items can be nonconformance records or kickbacks
        const ncrId = parseInt(entityId);
        if (!isNaN(ncrId)) {
          await db.update(nonconformanceRecords)
            .set({ 
              lastConfirmedAt: now, 
              lastConfirmedByUserId: userId,
              confirmationNote: confirmationNote || null,
              attentionRisk: null,
            })
            .where(eq(nonconformanceRecords.id, ncrId));
        }
        break;
      case 'production_delay':
        await db.update(productionDelays)
          .set({ 
            lastConfirmedAt: now, 
            lastConfirmedByUserId: userId,
            confirmationNote: confirmationNote || null,
            attentionRisk: null,
          })
          .where(eq(productionDelays.id, entityId));
        break;
    }

    // Log audit event
    await auditService.logEvent({
      entityType,
      entityId,
      action: 'ENTITY_CONFIRMED',
      actor: { id: userId, username },
      meta: {
        confirmedAt,
        confirmationNote,
      },
    });

    return { success: true, confirmedAt };
  }

  /**
   * Log entity viewed event with session deduplication
   */
  async logEntityViewed(
    entityType: AuditEntityType,
    entityId: string,
    userId: number,
    username: string,
    sessionId: string,
    meta?: Record<string, any>
  ): Promise<void> {
    await auditService.logEvent({
      entityType,
      entityId,
      action: 'ENTITY_VIEWED',
      actor: { id: userId, username },
      meta: {
        sessionId,
        ...meta,
      },
    });
  }

  /**
   * Update viewedBy tracking for an entity
   */
  async updateViewedBy(
    entityType: AuditEntityType,
    entityId: string,
    userId: number
  ): Promise<Record<string, string>> {
    const now = new Date().toISOString();
    
    switch (entityType) {
      case 'ticket':
        const [ticket] = await db.select({ viewedBy: tickets.viewedBy })
          .from(tickets)
          .where(eq(tickets.id, entityId));
        const ticketViewedBy = { ...(ticket?.viewedBy || {}), [userId.toString()]: now };
        await db.update(tickets)
          .set({ viewedBy: ticketViewedBy })
          .where(eq(tickets.id, entityId));
        return ticketViewedBy;

      case 'order':
        const [order] = await db.select({ viewedBy: orders.viewedBy })
          .from(orders)
          .where(eq(orders.orderId, entityId));
        const orderViewedBy = { ...(order?.viewedBy || {}), [userId.toString()]: now };
        await db.update(orders)
          .set({ viewedBy: orderViewedBy })
          .where(eq(orders.orderId, entityId));
        return orderViewedBy;

      case 'production_delay':
        const [delay] = await db.select({ viewedBy: productionDelays.viewedBy })
          .from(productionDelays)
          .where(eq(productionDelays.id, entityId));
        const delayViewedBy = { ...(delay?.viewedBy || {}), [userId.toString()]: now };
        await db.update(productionDelays)
          .set({ viewedBy: delayViewedBy })
          .where(eq(productionDelays.id, entityId));
        return delayViewedBy;

      default:
        return {};
    }
  }

  /**
   * Check if user has seen latest update
   */
  hasSeenLatestUpdate(
    viewedBy: Record<string, string> | null,
    userId: number,
    updatedAt: Date | null
  ): boolean {
    if (!viewedBy || !updatedAt) return false;
    const userViewedAt = viewedBy[userId.toString()];
    if (!userViewedAt) return false;
    return new Date(userViewedAt).getTime() >= new Date(updatedAt).getTime();
  }

  /**
   * Get attention dashboard data for all domains
   */
  async getAttentionDashboard(): Promise<{
    tickets: AttentionMetrics[];
    orders: AttentionMetrics[];
    qcItems: AttentionMetrics[];
    productionDelays: AttentionMetrics[];
    summary: {
      highRiskCount: number;
      mediumRiskCount: number;
      lowRiskCount: number;
      totalUnconfirmed: number;
    };
  }> {
    const now = Date.now();
    
    // Get tickets with attention risk
    const ticketData = await db.select({
      id: tickets.id,
      status: tickets.status,
      assignedUserId: tickets.assignedUserId,
      assignedUserIds: tickets.assignedUserIds,
      lastConfirmedAt: tickets.lastConfirmedAt,
      lastConfirmedByUserId: tickets.lastConfirmedByUserId,
      updatedAt: tickets.updatedAt,
      attentionRisk: tickets.attentionRisk,
      viewedBy: tickets.viewedBy,
    })
    .from(tickets)
    .where(and(
      isNull(tickets.archivedAt),
      inArray(tickets.status, ['new', 'in_progress', 'waiting_on_customer', 'waiting_on_production'])
    ))
    .orderBy(desc(tickets.updatedAt))
    .limit(100);

    const ticketMetrics: AttentionMetrics[] = [];
    for (const t of ticketData) {
      const threshold = await this.getThreshold('ticket', t.status);
      const risk = this.computeRiskLevel(t.lastConfirmedAt, t.updatedAt, threshold);
      ticketMetrics.push({
        entityId: t.id,
        entityType: 'ticket',
        currentStatus: t.status,
        assignedUserId: t.assignedUserId,
        assignedUserIds: t.assignedUserIds,
        lastConfirmedAt: t.lastConfirmedAt,
        lastConfirmedByUserId: t.lastConfirmedByUserId,
        updatedAt: t.updatedAt,
        attentionRisk: risk,
        hoursSinceConfirmation: t.lastConfirmedAt 
          ? (now - new Date(t.lastConfirmedAt).getTime()) / (1000 * 60 * 60) 
          : null,
        hasSeenLatestUpdate: false, // Computed per-user in detail views
        viewedBy: t.viewedBy || {},
      });
    }

    // Get production delays
    const delayData = await db.select({
      id: productionDelays.id,
      status: productionDelays.status,
      delayOwnerUserId: productionDelays.delayOwnerUserId,
      lastConfirmedAt: productionDelays.lastConfirmedAt,
      lastConfirmedByUserId: productionDelays.lastConfirmedByUserId,
      updatedAt: productionDelays.updatedAt,
      attentionRisk: productionDelays.attentionRisk,
      viewedBy: productionDelays.viewedBy,
    })
    .from(productionDelays)
    .where(eq(productionDelays.status, 'ACTIVE'))
    .orderBy(desc(productionDelays.updatedAt))
    .limit(100);

    const delayMetrics: AttentionMetrics[] = [];
    for (const d of delayData) {
      const threshold = await this.getThreshold('production_delay', d.status);
      const risk = this.computeRiskLevel(d.lastConfirmedAt, d.updatedAt, threshold);
      delayMetrics.push({
        entityId: d.id,
        entityType: 'production_delay',
        currentStatus: d.status,
        assignedUserId: d.delayOwnerUserId,
        lastConfirmedAt: d.lastConfirmedAt,
        lastConfirmedByUserId: d.lastConfirmedByUserId,
        updatedAt: d.updatedAt,
        attentionRisk: risk,
        hoursSinceConfirmation: d.lastConfirmedAt 
          ? (now - new Date(d.lastConfirmedAt).getTime()) / (1000 * 60 * 60) 
          : null,
        hasSeenLatestUpdate: false,
        viewedBy: d.viewedBy || {},
      });
    }

    // Compute summary
    const allMetrics = [...ticketMetrics, ...delayMetrics];
    const summary = {
      highRiskCount: allMetrics.filter(m => m.attentionRisk === 'high').length,
      mediumRiskCount: allMetrics.filter(m => m.attentionRisk === 'medium').length,
      lowRiskCount: allMetrics.filter(m => m.attentionRisk === 'low').length,
      totalUnconfirmed: allMetrics.filter(m => !m.lastConfirmedAt).length,
    };

    return {
      tickets: ticketMetrics,
      orders: [], // TODO: Implement order metrics
      qcItems: [], // TODO: Implement QC metrics
      productionDelays: delayMetrics,
      summary,
    };
  }
}

export const attentionStateService = new AttentionStateService();
