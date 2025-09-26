import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertCalendarEventSchema, insertCalendarEventAttendeeSchema } from '../../schema';

const router = Router();

// GET /api/calendar/events - Get all events or events within date range
router.get('/events', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, userId } = req.query;
    
    let events;
    
    if (userId) {
      // Get events for a specific user
      events = await storage.getUserCalendarEvents(userId as string);
    } else if (startDate && endDate) {
      // Get events within date range
      events = await storage.getCalendarEventsByDateRange(
        new Date(startDate as string),
        new Date(endDate as string)
      );
    } else {
      // Get all events
      events = await storage.getAllCalendarEvents();
    }
    
    res.json(events);
  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
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

export default router;