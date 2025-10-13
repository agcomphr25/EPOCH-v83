import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertCalendarEventSchema, insertCalendarEventAttendeeSchema } from '../../schema';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getUncachableGoogleCalendarClient } from '../lib/googleCalendar';

const router = Router();

// GET /api/calendar/events - Get all events or events within date range
router.get('/events', async (req: Request, res: Response) => {
  try {
    // Return empty array for now - local calendar storage not implemented
    // Google Calendar integration provides the main calendar functionality
    res.json([]);
  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// GET /api/calendar/google-events - Get Google Calendar events
router.get('/google-events', async (req: Request, res: Response) => {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    
    console.log('📅 Fetching Google Calendar events from', oneYearAgo.toISOString(), 'to', oneYearFromNow.toISOString());
    
    // First, get all calendars the user has access to
    const calendarListResponse = await calendar.calendarList.list();
    const calendars = calendarListResponse.data.items || [];
    
    console.log(`📅 Found ${calendars.length} calendars:`, calendars.map((c: any) => ({
      id: c.id,
      summary: c.summary,
      primary: c.primary,
      accessRole: c.accessRole
    })));
    
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
        console.error(`📅 Error fetching events from calendar "${cal.summary}":`, error);
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
      
      // Log sample all-day events to debug date issues
      if (isAllDay && events.indexOf(event) < 3) {
        console.log('📅 Sample all-day event:', {
          title: event.summary,
          originalStart: event.start?.date,
          originalEnd: event.end?.date,
        });
      }
      
      // Fix all-day events: Google Calendar uses exclusive end dates
      // A birthday on Nov 15 shows as start: Nov 15, end: Nov 16
      // We subtract one day from the end date string directly to avoid timezone issues
      if (isAllDay && endDate && typeof endDate === 'string') {
        const [year, month, day] = endDate.split('-').map(Number);
        const endDateObj = new Date(year, month - 1, day - 1); // Month is 0-indexed, subtract 1 day
        const adjustedYear = endDateObj.getFullYear();
        const adjustedMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
        const adjustedDay = String(endDateObj.getDate()).padStart(2, '0');
        endDate = `${adjustedYear}-${adjustedMonth}-${adjustedDay}`;
        
        if (events.indexOf(event) < 3) {
          console.log('  → Adjusted end date:', endDate);
        }
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
        color: event.colorId ? colorMap[event.colorId] : '#3b82f6', // Default to blue
        colorId: event.colorId || null,
        organizer: event.organizer?.email || '',
        creator: event.creator?.email || '',
        attendees: event.attendees?.map((a: any) => a.email) || [],
        calendarName: event.calendarName || 'Primary',
        calendarId: event.calendarId || 'primary',
      };
    });

    console.log(`📅 Fetched ${formattedEvents.length} total Google Calendar events from ${calendars.length} calendars`);
    
    // Log events by calendar
    const calendarSummary = formattedEvents.reduce((acc: any, event: any) => {
      const cal = event.calendarName || 'Unknown';
      acc[cal] = (acc[cal] || 0) + 1;
      return acc;
    }, {});
    console.log('📅 Events by calendar:', Object.keys(calendarSummary).map(cal => 
      `"${cal}": ${calendarSummary[cal]} events`
    ).join(', '));
    
    // Log color distribution
    const colorSummary = formattedEvents.reduce((acc: any, event: any) => {
      const color = event.colorId ? `Color ${event.colorId} (${event.color})` : `Default Blue (${event.color})`;
      acc[color] = (acc[color] || 0) + 1;
      return acc;
    }, {});
    console.log('📅 Color distribution:', colorSummary);
    
    // Log sample events with colors
    const sampleWithColors = formattedEvents.slice(0, 5).map((e: any) => ({
      title: e.title,
      colorId: e.colorId,
      color: e.color,
      calendar: e.calendarName
    }));
    console.log('📅 Sample events with colors:', sampleWithColors);

    res.json(formattedEvents);
  } catch (error) {
    console.error('Get Google Calendar events error:', error);
    res.status(500).json({ error: 'Failed to fetch Google Calendar events' });
  }
});

// GET /api/calendar/events/:id - Get specific event
router.get('/events/:id', async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const event = await storage.getCalendarEvent(eventId);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(event);
  } catch (error) {
    console.error('Get calendar event error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar event' });
  }
});

// POST /api/calendar/events - Create new event
router.post('/events', async (req: Request, res: Response) => {
  try {
    const validatedData = insertCalendarEventSchema.parse(req.body);
    const newEvent = await storage.createCalendarEvent(validatedData);
    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Create calendar event error:', error);
    if (error instanceof Error && error.message.includes('validation')) {
      res.status(400).json({ error: 'Invalid event data', details: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create calendar event' });
    }
  }
});

// PUT /api/calendar/events/:id - Update event
router.put('/events/:id', async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    
    // Validate the data against insert schema but allow partial updates
    const validatedData = insertCalendarEventSchema.partial().parse(req.body);
    
    const updatedEvent = await storage.updateCalendarEvent(eventId, validatedData);
    res.json(updatedEvent);
  } catch (error) {
    console.error('Update calendar event error:', error);
    if (error instanceof Error && error.message.includes('validation')) {
      res.status(400).json({ error: 'Invalid event data', details: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update calendar event' });
    }
  }
});

// DELETE /api/calendar/events/:id - Delete event
router.delete('/events/:id', async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    await storage.deleteCalendarEvent(eventId);
    res.status(204).send();
  } catch (error) {
    console.error('Delete calendar event error:', error);
    res.status(500).json({ error: 'Failed to delete calendar event' });
  }
});

// GET /api/calendar/events/:id/attendees - Get event attendees
router.get('/events/:id/attendees', async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const attendees = await storage.getEventAttendees(eventId);
    res.json(attendees);
  } catch (error) {
    console.error('Get event attendees error:', error);
    res.status(500).json({ error: 'Failed to fetch event attendees' });
  }
});

// POST /api/calendar/events/:id/attendees - Add attendee to event
router.post('/events/:id/attendees', async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const attendeeData = {
      ...req.body,
      eventId
    };
    
    const validatedData = insertCalendarEventAttendeeSchema.parse(attendeeData);
    const newAttendee = await storage.addEventAttendee(validatedData);
    res.status(201).json(newAttendee);
  } catch (error) {
    console.error('Add event attendee error:', error);
    if (error instanceof Error && error.message.includes('validation')) {
      res.status(400).json({ error: 'Invalid attendee data', details: error.message });
    } else {
      res.status(500).json({ error: 'Failed to add event attendee' });
    }
  }
});

// PUT /api/calendar/events/:id/attendees/:userId - Update attendee status
router.put('/events/:id/attendees/:userId', async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const userId = req.params.userId;
    const { status } = req.body;
    
    if (!['invited', 'accepted', 'declined', 'tentative'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    
    const updatedAttendee = await storage.updateAttendeeStatus(eventId, userId, status);
    res.json(updatedAttendee);
  } catch (error) {
    console.error('Update attendee status error:', error);
    res.status(500).json({ error: 'Failed to update attendee status' });
  }
});

// DELETE /api/calendar/events/:id/attendees/:userId - Remove attendee from event
router.delete('/events/:id/attendees/:userId', async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const userId = req.params.userId;
    
    await storage.removeEventAttendee(eventId, userId);
    res.status(204).send();
  } catch (error) {
    console.error('Remove event attendee error:', error);
    res.status(500).json({ error: 'Failed to remove event attendee' });
  }
});

// Generate blank calendar PDF (shared function)
const generateBlankPDF = async (req: Request, res: Response) => {
  // Support both GET (query params) and POST (body) parameters
  const params = req.method === 'GET' ? req.query : req.body;
  console.log('🔍 PDF Route called with:', { method: req.method, month: params?.month, view: params?.view });
  try {
    const { month, view } = params;
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard letter size
    const { width, height } = page.getSize();
    
    // Load a font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Define colors
    const black = rgb(0, 0, 0);
    const gray = rgb(0.7, 0.7, 0.7);
    const lightGray = rgb(0.9, 0.9, 0.9);
    
    // Parse month and year from the input (format: YYYY-MM)
    const [year, monthNum] = month ? month.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[monthNum - 1];
    
    // Add header with company logo space and title
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
    
    // Add calendar grid based on view type
    const startY = headerY - 60;
    
    if (view === 'month' || !view) {
      // Generate monthly calendar grid
      const cellWidth = (width - 100) / 7;
      const cellHeight = (startY - 100) / 6;
      
      // Days of week header
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dayNames.forEach((day, index) => {
        const x = 50 + (index * cellWidth);
        const y = startY;
        
        // Header background
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
      
      // Get first day of month and number of days
      const firstDay = new Date(year, monthNum - 1, 1).getDay();
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      
      // Draw calendar grid and numbers
      let dayCounter = 1;
      for (let week = 0; week < 6; week++) {
        for (let day = 0; day < 7; day++) {
          const x = 50 + (day * cellWidth);
          const y = startY - (cellHeight / 4) - ((week + 1) * cellHeight);
          
          // Draw cell border
          page.drawRectangle({
            x,
            y,
            width: cellWidth,
            height: cellHeight,
            borderColor: gray,
            borderWidth: 1,
          });
          
          // Add day number
          if ((week === 0 && day >= firstDay) || (week > 0 && dayCounter <= daysInMonth)) {
            if (week === 0 && day < firstDay) {
              // Skip days before month starts
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
      // Generate weekly calendar grid
      const cellWidth = (width - 150) / 7;
      const cellHeight = 30;
      const hoursPerDay = 12; // 8 AM to 8 PM
      
      // Time column header
      page.drawText('Time', {
        x: 50,
        y: startY,
        size: 12,
        font: boldFont,
        color: black,
      });
      
      // Days of week header
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dayNames.forEach((day, index) => {
        const x = 150 + (index * cellWidth);
        page.drawText(day, {
          x: x + 10,
          y: startY,
          size: 10,
          font: boldFont,
          color: black,
        });
      });
      
      // Draw time slots and grid
      for (let hour = 8; hour <= 20; hour++) {
        const y = startY - ((hour - 7) * cellHeight);
        const timeText = hour <= 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
        
        // Time label
        page.drawText(timeText, {
          x: 50,
          y: y - 10,
          size: 9,
          font,
          color: black,
        });
        
        // Draw day cells
        for (let day = 0; day < 7; day++) {
          const x = 150 + (day * cellWidth);
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
      // Generate daily calendar view
      const cellWidth = width - 200;
      const cellHeight = 30;
      
      page.drawText('Daily Schedule', {
        x: 100,
        y: startY,
        size: 14,
        font: boldFont,
        color: black,
      });
      
      // Draw time slots
      for (let hour = 6; hour <= 22; hour++) {
        const y = startY - ((hour - 5) * cellHeight);
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
    
    // Add footer
    page.drawText('Generated by EPOCH v8 Manufacturing ERP System', {
      x: 50,
      y: 30,
      size: 10,
      font,
      color: gray,
    });
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    console.log(`📄 Generated PDF: ${pdfBytes.length} bytes for ${monthName} ${year}`);
    
    // Set response headers for inline display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="calendar-${monthName}-${year}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    
    console.log('📤 Sending PDF response with headers:', {
      contentType: 'application/pdf',
      contentLength: pdfBytes.length
    });
    
    // Send PDF
    res.send(Buffer.from(pdfBytes));
    
  } catch (error) {
    console.error('❌ Generate blank calendar PDF error:', error);
    console.error('❌ Full error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ error: 'Failed to generate calendar PDF' });
  }
};

// GET /api/calendar/blank-pdf - Direct URL access for PDF (Chrome-safe)
router.get('/blank-pdf', generateBlankPDF);

// POST /api/calendar/blank-pdf - Generate blank calendar PDF (original method)
router.post('/blank-pdf', generateBlankPDF);

export default router;