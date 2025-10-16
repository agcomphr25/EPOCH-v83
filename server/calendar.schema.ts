import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

/** Calendar Events */
export const calendarEvents = sqliteTable('calendar_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  startDate: text('start_date').notNull(), // store as ISO string
  endDate: text('end_date').notNull(),
  location: text('location'),
  allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
  eventType: text('event_type').notNull().default('meeting'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Event Attendees */
export const calendarEventAttendees = sqliteTable('calendar_event_attendees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull(), // FK to calendar_events.id
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('invited'), // invited|accepted|declined|tentative
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/** Zod insert schemas used by routes */
export const insertCalendarEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.coerce.date(), // accept ISO string/Date
  endDate: z.coerce.date(),
  location: z.string().optional(),
  allDay: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  eventType: z.string().default('meeting'),
  createdBy: z.string().min(1),
});

export const insertCalendarEventAttendeeSchema = z.object({
  eventId: z.number().int(),
  userId: z.string().min(1),
  status: z
    .enum(['invited', 'accepted', 'declined', 'tentative'])
    .default('invited'),
});
