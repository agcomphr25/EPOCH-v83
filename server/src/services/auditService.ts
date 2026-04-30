/**
 * Audit Service - Handles logging of audit events and tracking
 * 
 * This service provides methods to:
 * - Log audit events for any entity change
 * - Track department transitions with timing
 * - Handle scrap/restart cycle tracking
 * - Query audit history for entities
 */

import { db } from '../../db';
import { auditEvents, auditSettings, orderDepartmentTransitions, orderScrapCycles } from '../../schema';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { getChangedFields, getEventTypeForField } from '@shared/auditConfig';

export interface AuditActor {
  id?: number;
  username?: string;
  role?: string;
}

// Entity types for audit events - Attention & State-Confidence system entities included
export type AuditEntityType = 
  | 'p1_order' 
  | 'p2_order' 
  | 'p2_serialized_item' 
  | 'p2_project' 
  | 'qr_code' 
  | 'ticket'
  | 'order'           // For order attention tracking
  | 'qc_item'         // For QC nonconformance/kickback attention tracking
  | 'production_delay' // For production delay attention tracking
  | 'employee'        // For employee profile changes
  | 'employee_onboarding' // For onboarding session tracking
  | 'work_order'      // For production work order (WAD) events
  | 'traveler'        // For traveler lifecycle events
  | 'traveler_step'   // For traveler step events
  | 'time_entry'      // For time entry / punch edits
  | 'edri_snapshot'   // For EDRI compliance score snapshots and overrides
  | 'user_session'    // For session lifecycle events (CMMC §3.5/§3.13)
  | 'vault_document' // For vault document access-denied events
  | 'vendor';        // For vendor record changes

// Standard audit actions for Attention & State-Confidence system
export type AttentionAuditAction = 
  | 'ENTITY_VIEWED'           // User viewed the entity
  | 'ENTITY_CONFIRMED'        // User confirmed state is still accurate
  | 'ENTITY_STATE_STALE'      // State has become stale (exceeded threshold)
  | 'ATTENTION_RISK_ESCALATED' // Risk level increased
  | 'TICKET_VIEWED'           // Legacy - kept for backwards compatibility
  | 'TICKET_ACKNOWLEDGED';    // Legacy - kept for backwards compatibility

export interface AuditEventInput {
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  actor?: AuditActor;
  reason?: string;
  fieldsChanged?: Record<string, { before: any; after: any }>;
  meta?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface DepartmentTransitionInput {
  entityType: 'p1_order' | 'p2_serialized_item';
  entityId: string;
  department: string;
  cycleNumber?: number;
  enteredByUserId?: number;
  metadata?: Record<string, any>;
}

export interface ScrapCycleInput {
  entityType: 'p1_order' | 'p2_serialized_item';
  originalEntityId: string;
  cycleNumber: number;
  scrapReason: string;
  scrapDepartment?: string;
  scrapAuthorizedBy?: number;
  scrapEventId?: number;
  metadata?: Record<string, any>;
}

class AuditService {
  /**
   * Log an audit event - HARDENED: throws on failure, no silent inserts
   */
  async logEvent(input: AuditEventInput): Promise<number> {
    if (!input.action) {
      throw new Error("AUDIT ERROR: action is required");
    }
    if (!input.entityType) {
      throw new Error("AUDIT ERROR: entityType is required");
    }
    if (!input.entityId) {
      throw new Error("AUDIT ERROR: entityId is required");
    }

    // Check if this event type is enabled (still respect settings for non-critical)
    const setting = await this.getEventSetting(input.action);
    if (setting && !setting.isEnabled && !setting.isCritical) {
      // Event type is disabled and not critical - skip logging but don't throw
      return 0;
    }

    const now = new Date();
    const result = await db.insert(auditEvents).values({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.username ?? null,
      actorRole: input.actor?.role ?? null,
      reason: input.reason ?? null,
      fieldsChanged: input.fieldsChanged ?? null,
      meta: input.meta ?? {},
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
    }).returning({ id: auditEvents.id });

    if (!result[0]?.id) {
      throw new Error("AUDIT ERROR: insert returned no ID");
    }

    return result[0].id;
  }

  /**
   * Log field changes automatically by comparing before/after states
   */
  async logFieldChanges(
    entityType: 'p1_order' | 'p2_order' | 'p2_serialized_item' | 'p2_project',
    entityId: string,
    before: Record<string, any>,
    after: Record<string, any>,
    actor?: AuditActor,
    meta?: Record<string, any>
  ): Promise<number[]> {
    console.log(
      "[AUDIT] logFieldChanges called",
      entityType,
      entityId
    );
    const changes = getChangedFields(before, after, entityType);
    
    // Guard: nothing to log if no changes detected
    if (Object.keys(changes).length === 0) {
      console.log("[AUDIT] logFieldChanges: no changes detected, skipping");
      return [];
    }
    
    const eventIds: number[] = [];

    // Group changes by event type
    const changesByEventType: Record<string, Record<string, { before: any; after: any }>> = {};
    
    for (const [fieldName, change] of Object.entries(changes)) {
      const eventType = change.eventType;
      
      // Guard: eventType must be defined
      if (!eventType) {
        throw new Error(`AUDIT ERROR: getEventTypeForField returned undefined for field "${fieldName}"`);
      }
      
      if (!changesByEventType[eventType]) {
        changesByEventType[eventType] = {};
      }
      changesByEventType[eventType][fieldName] = { before: change.before, after: change.after };
    }

    // Create one audit event per event type
    for (const [eventType, fields] of Object.entries(changesByEventType)) {
      const eventId = await this.logEvent({
        entityType,
        entityId,
        action: eventType,
        actor,
        fieldsChanged: fields,
        meta,
      });
      if (eventId) eventIds.push(eventId);
    }

    return eventIds;
  }

  /**
   * Record a department transition (entry)
   */
  async recordDepartmentEntry(input: DepartmentTransitionInput): Promise<string | null> {
    console.log(
      "[AUDIT] recordDepartmentEntry",
      input.entityType,
      input.entityId,
      input.department
    );
    try {
      // First, close any open transition for this entity
      await this.closeDepartmentTransition(input.entityId, input.enteredByUserId, 'completed');

      const result = await db.insert(orderDepartmentTransitions).values({
        entityType: input.entityType,
        entityId: input.entityId,
        department: input.department,
        cycleNumber: input.cycleNumber || 1,
        enteredAt: new Date(),
        enteredByUserId: input.enteredByUserId || null,
        metadata: input.metadata || null,
      }).returning({ id: orderDepartmentTransitions.id });

      return result[0]?.id || null;
    } catch (error) {
      console.error('Failed to record department entry:', error);
      return null;
    }
  }

  /**
   * Close an open department transition (exit)
   */
  async closeDepartmentTransition(
    entityId: string,
    exitedByUserId?: number,
    exitReason: string = 'completed'
  ): Promise<boolean> {
    try {
      const openTransition = await db.select()
        .from(orderDepartmentTransitions)
        .where(and(
          eq(orderDepartmentTransitions.entityId, entityId),
          isNull(orderDepartmentTransitions.exitedAt)
        ))
        .limit(1);

      if (openTransition.length === 0) return false;

      const transition = openTransition[0];
      const exitedAt = new Date();
      const durationMinutes = Math.round(
        (exitedAt.getTime() - new Date(transition.enteredAt).getTime()) / (1000 * 60)
      );

      await db.update(orderDepartmentTransitions)
        .set({
          exitedAt,
          durationMinutes,
          exitedByUserId: exitedByUserId || null,
          exitReason,
        })
        .where(eq(orderDepartmentTransitions.id, transition.id));

      return true;
    } catch (error) {
      console.error('Failed to close department transition:', error);
      return false;
    }
  }

  /**
   * Record a scrap event and create a new cycle
   */
  async recordScrapCycle(input: ScrapCycleInput): Promise<string | null> {
    try {
      // Close current department transition as scrap
      await this.closeDepartmentTransition(input.originalEntityId, input.scrapAuthorizedBy, 'scrap');

      const result = await db.insert(orderScrapCycles).values({
        entityType: input.entityType,
        originalEntityId: input.originalEntityId,
        cycleNumber: input.cycleNumber,
        scrapEventId: input.scrapEventId || null,
        scrapReason: input.scrapReason,
        scrapDepartment: input.scrapDepartment || null,
        scrapAuthorizedBy: input.scrapAuthorizedBy || null,
        scrappedAt: new Date(),
        metadata: input.metadata || null,
      }).returning({ id: orderScrapCycles.id });

      return result[0]?.id || null;
    } catch (error) {
      console.error('Failed to record scrap cycle:', error);
      return null;
    }
  }

  /**
   * Link a restart order to a scrap cycle
   */
  async linkRestartToScrapCycle(
    scrapCycleId: string,
    restartEntityId: string,
    restartedByUserId?: number
  ): Promise<boolean> {
    try {
      await db.update(orderScrapCycles)
        .set({
          restartEntityId,
          restartedAt: new Date(),
          restartedByUserId: restartedByUserId || null,
        })
        .where(eq(orderScrapCycles.id, scrapCycleId));

      return true;
    } catch (error) {
      console.error('Failed to link restart to scrap cycle:', error);
      return false;
    }
  }

  /**
   * Get audit history for an entity
   */
  async getAuditHistory(
    entityType: string,
    entityId: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const events = await db.select()
        .from(auditEvents)
        .where(and(
          eq(auditEvents.entityType, entityType),
          eq(auditEvents.entityId, entityId)
        ))
        .orderBy(desc(auditEvents.createdAt))
        .limit(limit);

      return events;
    } catch (error) {
      console.error('Failed to get audit history:', error);
      return [];
    }
  }

  /**
   * Get department transitions for an entity
   */
  async getDepartmentTransitions(
    entityId: string,
    cycleNumber?: number
  ): Promise<any[]> {
    try {
      let query = db.select()
        .from(orderDepartmentTransitions)
        .where(eq(orderDepartmentTransitions.entityId, entityId))
        .orderBy(orderDepartmentTransitions.enteredAt);

      if (cycleNumber) {
        query = db.select()
          .from(orderDepartmentTransitions)
          .where(and(
            eq(orderDepartmentTransitions.entityId, entityId),
            eq(orderDepartmentTransitions.cycleNumber, cycleNumber)
          ))
          .orderBy(orderDepartmentTransitions.enteredAt);
      }

      return await query;
    } catch (error) {
      console.error('Failed to get department transitions:', error);
      return [];
    }
  }

  /**
   * Get scrap cycles for an entity
   */
  async getScrapCycles(originalEntityId: string): Promise<any[]> {
    try {
      const cycles = await db.select()
        .from(orderScrapCycles)
        .where(eq(orderScrapCycles.originalEntityId, originalEntityId))
        .orderBy(orderScrapCycles.cycleNumber);

      return cycles;
    } catch (error) {
      console.error('Failed to get scrap cycles:', error);
      return [];
    }
  }

  /**
   * Get department time summary for an entity
   */
  async getDepartmentTimeSummary(entityId: string): Promise<Record<string, number>> {
    try {
      const transitions = await this.getDepartmentTransitions(entityId);
      const summary: Record<string, number> = {};

      for (const t of transitions) {
        const dept = t.department;
        const duration = t.durationMinutes || 0;
        summary[dept] = (summary[dept] || 0) + duration;
      }

      return summary;
    } catch (error) {
      console.error('Failed to get department time summary:', error);
      return {};
    }
  }

  /**
   * Get event setting from database
   */
  private async getEventSetting(eventType: string): Promise<any | null> {
    try {
      const settings = await db.select()
        .from(auditSettings)
        .where(eq(auditSettings.eventType, eventType))
        .limit(1);

      return settings[0] || null;
    } catch (error) {
      console.error('Failed to get event setting:', error);
      return null;
    }
  }

  /**
   * Get all audit settings
   */
  async getAllSettings(): Promise<any[]> {
    try {
      const settings = await db.select()
        .from(auditSettings)
        .orderBy(auditSettings.sortOrder);

      return settings;
    } catch (error) {
      console.error('Failed to get audit settings:', error);
      return [];
    }
  }

  /**
   * Update an audit setting
   */
  async updateSetting(eventType: string, isEnabled: boolean): Promise<boolean> {
    try {
      // Don't allow disabling critical events
      const setting = await this.getEventSetting(eventType);
      if (setting?.isCritical) {
        return false;
      }

      await db.update(auditSettings)
        .set({ 
          isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(auditSettings.eventType, eventType));

      return true;
    } catch (error) {
      console.error('Failed to update audit setting:', error);
      return false;
    }
  }
}

export const auditService = new AuditService();
