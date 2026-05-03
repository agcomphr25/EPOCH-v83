import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { z } from 'zod';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getGoogleCalendarClient } from '../lib/googleCalendar';
import { authenticateToken } from '../../middleware/auth';

const router = Router();

// ── Local calendar events ─────────────────────────────────────────────────────

// GET /api/calendar/events - Get events visible to current user
router.get('/events', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const events = await storage.getLocalCalendarEventsForUser(userId);
    res.json(events);
  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// POST /api/calendar/events - Create new event
const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  location: z.string().optional(),
  allDay: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  eventType: z.string().default('meeting'),
  calendarId: z.number().int().optional().nullable(),
});

async function userCanAccessCalendar(userId: number, calendarId: number | null | undefined): Promise<boolean> {
  if (calendarId == null) return true;
  const cal = await storage.getCalendar(calendarId);
  if (!cal) return false;
  if (cal.ownerUserId === userId) return true;
  if (cal.isPrivate) return false;
  const shares = await storage.getCalendarShares(calendarId);
  return shares.some((s) => s.sharedWithUserId === userId);
}

router.post('/events', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid event data', details: parsed.error.flatten() });
    }
    if (!(await userCanAccessCalendar(userId, parsed.data.calendarId))) {
      return res.status(403).json({ error: 'You do not have access to that calendar' });
    }
    const event = await storage.createLocalCalendarEvent({
      ...parsed.data,
      createdByUserId: userId,
    });
    res.status(201).json(event);
  } catch (error) {
    console.error('Create calendar event error:', error);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// PUT /api/calendar/events/:id - Update event
router.put('/events/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const eventId = parseInt(req.params.id);
    const existing = await storage.getLocalCalendarEvent(eventId);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    if (existing.createdByUserId !== userId) return res.status(403).json({ error: 'Not your event' });
    const parsed = createEventSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid event data', details: parsed.error.flatten() });
    }
    if ('calendarId' in parsed.data && !(await userCanAccessCalendar(userId, parsed.data.calendarId))) {
      return res.status(403).json({ error: 'You do not have access to that calendar' });
    }
    const updated = await storage.updateLocalCalendarEvent(eventId, parsed.data);
    res.json(updated);
  } catch (error) {
    console.error('Update calendar event error:', error);
    res.status(500).json({ error: 'Failed to update calendar event' });
  }
});

// DELETE /api/calendar/events/:id - Delete event
router.delete('/events/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const eventId = parseInt(req.params.id);
    const existing = await storage.getLocalCalendarEvent(eventId);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    if (existing.createdByUserId !== userId) return res.status(403).json({ error: 'Not your event' });
    await storage.deleteLocalCalendarEvent(eventId);
    res.status(204).send();
  } catch (error) {
    console.error('Delete calendar event error:', error);
    res.status(500).json({ error: 'Failed to delete calendar event' });
  }
});

// ── User calendars ────────────────────────────────────────────────────────────

// GET /api/calendar/calendars - Get calendars accessible by current user
router.get('/calendars', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const calendars = await storage.getCalendarsForUser(userId);
    // For each calendar, attach share info
    const result = await Promise.all(
      calendars.map(async (cal) => {
        const shares = await storage.getCalendarShares(cal.id);
        return { ...cal, shares };
      })
    );
    res.json(result);
  } catch (error) {
    console.error('Get calendars error:', error);
    res.status(500).json({ error: 'Failed to fetch calendars' });
  }
});

// POST /api/calendar/calendars - Create a new calendar
const createCalendarSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#3174ad'),
  isPrivate: z.boolean().default(false),
  shareWithUserIds: z.array(z.number().int()).default([]),
});

router.post('/calendars', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = createCalendarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid calendar data', details: parsed.error.flatten() });
    }
    const { shareWithUserIds, ...calData } = parsed.data;
    const calendar = await storage.createCalendar({ ...calData, ownerUserId: userId });
    // Add shares
    if (!calData.isPrivate && shareWithUserIds.length > 0) {
      for (const uid of shareWithUserIds) {
        if (uid !== userId) {
          await storage.addCalendarShare({ calendarId: calendar.id, sharedWithUserId: uid });
        }
      }
    }
    const shares = await storage.getCalendarShares(calendar.id);
    res.status(201).json({ ...calendar, shares });
  } catch (error) {
    console.error('Create calendar error:', error);
    res.status(500).json({ error: 'Failed to create calendar' });
  }
});

// PUT /api/calendar/calendars/:id - Update calendar
const updateCalendarSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  isPrivate: z.boolean().optional(),
  shareWithUserIds: z.array(z.number().int()).optional(),
});

router.put('/calendars/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const calId = parseInt(req.params.id);
    const existing = await storage.getCalendar(calId);
    if (!existing) return res.status(404).json({ error: 'Calendar not found' });
    if (existing.ownerUserId !== userId) return res.status(403).json({ error: 'Not your calendar' });
    const parsed = updateCalendarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid calendar data', details: parsed.error.flatten() });
    }
    const { shareWithUserIds, ...calData } = parsed.data;
    const updated = await storage.updateCalendar(calId, calData);
    // Update shares if provided
    if (shareWithUserIds !== undefined) {
      const currentShares = await storage.getCalendarShares(calId);
      const currentUserIds = new Set(currentShares.map((s) => s.sharedWithUserId));
      const newUserIds = new Set(shareWithUserIds.filter((uid) => uid !== userId));
      // Remove shares no longer in list
      for (const uid of currentUserIds) {
        if (!newUserIds.has(uid)) {
          await storage.removeCalendarShare(calId, uid);
        }
      }
      // Add new shares
      for (const uid of newUserIds) {
        if (!currentUserIds.has(uid)) {
          await storage.addCalendarShare({ calendarId: calId, sharedWithUserId: uid });
        }
      }
    }
    const shares = await storage.getCalendarShares(calId);
    res.json({ ...updated, shares });
  } catch (error) {
    console.error('Update calendar error:', error);
    res.status(500).json({ error: 'Failed to update calendar' });
  }
});

// DELETE /api/calendar/calendars/:id - Delete calendar (and its events)
router.delete('/calendars/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const calId = parseInt(req.params.id);
    const existing = await storage.getCalendar(calId);
    if (!existing) return res.status(404).json({ error: 'Calendar not found' });
    if (existing.ownerUserId !== userId) return res.status(403).json({ error: 'Not your calendar' });
    await storage.deleteCalendar(calId);
    res.status(204).send();
  } catch (error) {
    console.error('Delete calendar error:', error);
    res.status(500).json({ error: 'Failed to delete calendar' });
  }
});

// POST /api/calendar/calendars/:id/shares - Add a user to calendar shares
router.post('/calendars/:id/shares', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const calId = parseInt(req.params.id);
    const cal = await storage.getCalendar(calId);
    if (!cal) return res.status(404).json({ error: 'Calendar not found' });
    if (cal.ownerUserId !== userId) return res.status(403).json({ error: 'Not your calendar' });
    const parsed = z.object({ sharedWithUserId: z.number().int() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    if (parsed.data.sharedWithUserId === userId) return res.status(400).json({ error: 'Cannot share calendar with yourself' });
    const share = await storage.addCalendarShare({ calendarId: calId, sharedWithUserId: parsed.data.sharedWithUserId });
    res.status(201).json(share);
  } catch (error) {
    console.error('Add calendar share error:', error);
    res.status(500).json({ error: 'Failed to add calendar share' });
  }
});

// DELETE /api/calendar/calendars/:id/shares/:userId - Remove a user from calendar shares
router.delete('/calendars/:id/shares/:shareUserId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const calId = parseInt(req.params.id);
    const shareUserId = parseInt(req.params.shareUserId);
    const cal = await storage.getCalendar(calId);
    if (!cal) return res.status(404).json({ error: 'Calendar not found' });
    if (cal.ownerUserId !== userId) return res.status(403).json({ error: 'Not your calendar' });
    await storage.removeCalendarShare(calId, shareUserId);
    res.status(204).send();
  } catch (error) {
    console.error('Remove calendar share error:', error);
    res.status(500).json({ error: 'Failed to remove calendar share' });
  }
});

// GET /api/calendar/google-events - Get Google Calendar events
router.get('/google-events', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const calendar = await getGoogleCalendarClient(userId);

    const now = new Date();
    const oneYearAgo = new Date(
      now.getFullYear() - 1,
      now.getMonth(),
      now.getDate()
    );
    const oneYearFromNow = new Date(
      now.getFullYear() + 1,
      now.getMonth(),
      now.getDate()
    );

    console.log(
      '📅 Fetching Google Calendar events from',
      oneYearAgo.toISOString(),
      'to',
      oneYearFromNow.toISOString()
    );

    // First, get all calendars the user has access to
    const calendarListResponse = await calendar.calendarList.list();
    const calendars = calendarListResponse.data.items || [];

    console.log(
      `📅 Found ${calendars.length} calendars:`,
      calendars.map((c: any) => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary,
        accessRole: c.accessRole,
      }))
    );

    // Fetch events from ALL calendars
    const allEventsPromises = calendars.map(async (cal: any) => {
      try {
        const response = await calendar.events.list({
          calendarId: cal.id,
          timeMin: oneYearAgo.toISOString(),
          timeMax: oneYearFromNow.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
        });

        const events = (response.data.items || []).map((event: any) => ({
          ...event,
          calendarName: cal.summary,
          calendarId: cal.id,
        }));

        console.log(`📅 Calendar "${cal.summary}": ${events.length} events`);
        return events;
      } catch (error) {
        console.error(
          `📅 Error fetching events from calendar "${cal.summary}":`,
          error
        );
        return [];
      }
    });

    const allEventsArrays = await Promise.all(allEventsPromises);
    const events = allEventsArrays.flat();

    // Google Calendar color mapping
    const colorMap: { [key: string]: string } = {
      '1': '#a4bdfc', // Lavender
      '2': '#7ae7bf', // Sage
      '3': '#dbadff', // Grape
      '4': '#ff887c', // Flamingo
      '5': '#fbd75b', // Banana
      '6': '#ffb878', // Tangerine
      '7': '#46d6db', // Peacock
      '8': '#e1e1e1', // Graphite
      '9': '#5484ed', // Blueberry
      '10': '#51b749', // Basil
      '11': '#dc2127', // Tomato
    };

    const formattedEvents = events.map((event: any) => {
      const isAllDay = !event.start?.dateTime;
      let startDate = event.start?.dateTime || event.start?.date;
      let endDate = event.end?.dateTime || event.end?.date;

      if (isAllDay && endDate && typeof endDate === 'string') {
        const [year, month, day] = endDate.split('-').map(Number);
        const endDateObj = new Date(year, month - 1, day - 1);
        const adjustedYear = endDateObj.getFullYear();
        const adjustedMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
        const adjustedDay = String(endDateObj.getDate()).padStart(2, '0');
        endDate = `${adjustedYear}-${adjustedMonth}-${adjustedDay}`;
      }

      let eventColor = '#3b82f6';
      if (event.calendarName === 'Holidays in United States') {
        eventColor = '#dc2127';
      } else if (event.summary && /birthday/i.test(event.summary)) {
        eventColor = '#dbadff';
      } else if (event.summary && (/evaluation/i.test(event.summary) || /cert/i.test(event.summary))) {
        eventColor = '#ff887c';
      } else if (event.colorId && colorMap[event.colorId]) {
        eventColor = colorMap[event.colorId];
      }

      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        startDate,
        endDate,
        location: event.location || '',
        allDay: isAllDay,
        isPublic: event.visibility === 'public',
        eventType: 'meeting',
        createdBy: event.creator?.email || event.organizer?.email || 'Google Calendar',
        source: 'google',
        color: eventColor,
        colorId: event.colorId || null,
        organizer: event.organizer?.email || '',
        creator: event.creator?.email || '',
        attendees: event.attendees?.map((a: any) => a.email) || [],
        calendarName: event.calendarName || 'Primary',
        calendarId: event.calendarId || 'primary',
      };
    });

    console.log(`📅 Fetched ${formattedEvents.length} total Google Calendar events from ${calendars.length} calendars`);
    res.json(formattedEvents);
  } catch (error: any) {
    console.error('Get Google Calendar events error:', error);
    if (error.needsReauth) {
      return res.status(409).json({ error: error.message, needsReauth: true });
    }
    res.status(500).json({ error: 'Failed to fetch Google Calendar events' });
  }
});

// Generate blank calendar PDF (shared function)
const generateBlankPDF = async (req: Request, res: Response) => {
  const params = req.method === 'GET' ? req.query : req.body;
  console.log('🔍 PDF Route called with:', {
    method: req.method,
    month: params?.month,
    view: params?.view,
  });
  try {
    const { month, view } = params;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const black = rgb(0, 0, 0);
    const gray = rgb(0.7, 0.7, 0.7);
    const lightGray = rgb(0.9, 0.9, 0.9);

    const [year, monthNum] = month
      ? month.split('-').map(Number)
      : [new Date().getFullYear(), new Date().getMonth() + 1];
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthName = monthNames[monthNum - 1];

    const headerY = height - 50;
    page.drawText('AG Composites LLC', {
      x: 50,
      y: headerY,
      size: 16,
      font: boldFont,
      color: black,
    });

    page.drawText(`${monthName} ${year} Calendar`, {
      x: width / 2 - 80,
      y: headerY,
      size: 20,
      font: boldFont,
      color: black,
    });

    const startY = headerY - 60;

    if (view === 'month' || !view) {
      const cellWidth = (width - 100) / 7;
      const cellHeight = (startY - 100) / 6;

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dayNames.forEach((day, index) => {
        const x = 50 + index * cellWidth;
        const y = startY;

        page.drawRectangle({
          x,
          y: y - cellHeight / 4,
          width: cellWidth,
          height: cellHeight / 4,
          color: lightGray,
        });

        page.drawText(day.substring(0, 3), {
          x: x + 10,
          y: y - 15,
          size: 10,
          font: boldFont,
          color: black,
        });
      });

      const firstDay = new Date(year, monthNum - 1, 1).getDay();
      const daysInMonth = new Date(year, monthNum, 0).getDate();

      let dayCounter = 1;
      for (let week = 0; week < 6; week++) {
        for (let day = 0; day < 7; day++) {
          const x = 50 + day * cellWidth;
          const y = startY - cellHeight / 4 - (week + 1) * cellHeight;

          page.drawRectangle({
            x,
            y,
            width: cellWidth,
            height: cellHeight,
            borderColor: gray,
            borderWidth: 1,
          });

          if (
            (week === 0 && day >= firstDay) ||
            (week > 0 && dayCounter <= daysInMonth)
          ) {
            if (week === 0 && day < firstDay) {
              // Skip
            } else if (dayCounter <= daysInMonth) {
              page.drawText(dayCounter.toString(), {
                x: x + 5,
                y: y + cellHeight - 20,
                size: 12,
                font: boldFont,
                color: black,
              });
              dayCounter++;
            }
          }
        }
      }
    } else if (view === 'week') {
      const cellWidth = (width - 150) / 7;
      const cellHeight = 30;

      page.drawText('Time', {
        x: 50,
        y: startY,
        size: 12,
        font: boldFont,
        color: black,
      });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dayNames.forEach((day, index) => {
        const x = 150 + index * cellWidth;
        page.drawText(day, {
          x: x + 10,
          y: startY,
          size: 10,
          font: boldFont,
          color: black,
        });
      });

      for (let hour = 8; hour <= 20; hour++) {
        const y = startY - (hour - 7) * cellHeight;
        const timeText = hour <= 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;

        page.drawText(timeText, {
          x: 50,
          y: y - 10,
          size: 9,
          font,
          color: black,
        });

        for (let day = 0; day < 7; day++) {
          const x = 150 + day * cellWidth;
          page.drawRectangle({
            x,
            y: y - cellHeight,
            width: cellWidth,
            height: cellHeight,
            borderColor: gray,
            borderWidth: 0.5,
          });
        }
      }
    } else if (view === 'day') {
      const cellWidth = width - 200;
      const cellHeight = 30;

      page.drawText('Daily Schedule', {
        x: 100,
        y: startY,
        size: 14,
        font: boldFont,
        color: black,
      });

      for (let hour = 6; hour <= 22; hour++) {
        const y = startY - (hour - 5) * cellHeight;
        const timeText = hour <= 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;

        page.drawText(timeText, {
          x: 50,
          y: y - 10,
          size: 10,
          font,
          color: black,
        });

        page.drawRectangle({
          x: 150,
          y: y - cellHeight,
          width: cellWidth,
          height: cellHeight,
          borderColor: gray,
          borderWidth: 0.5,
        });
      }
    }

    page.drawText('Generated by EPOCH v8 Manufacturing ERP System', {
      x: 50,
      y: 30,
      size: 10,
      font,
      color: gray,
    });

    const pdfBytes = await pdfDoc.save();
    console.log(`📄 Generated PDF: ${pdfBytes.length} bytes for ${monthName} ${year}`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="calendar-${monthName}-${year}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('❌ Generate blank calendar PDF error:', error);
    res.status(500).json({ error: 'Failed to generate calendar PDF' });
  }
};

router.get('/blank-pdf', generateBlankPDF);
router.post('/blank-pdf', generateBlankPDF);

export default router;
