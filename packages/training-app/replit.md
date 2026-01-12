# Train-the-Trainer Builder

## Overview
A full-stack Train-the-Trainer application for manufacturing training programs. Implements a 4-step competency training model with S-O-A (Strength, Opportunity, Action) coaching framework.

## Training Philosophy
- **4-Step Method**: Trainer Does/Explains → Trainer Does/Trainee Explains → Trainee Does/Trainer Coaches → Trainee Does/Trainer Observes
- **S-O-A Coaching**: Strength-first, positive coaching approach
- **Critical Points**: Safety, quality, and compliance checkpoints per work instruction
- **Competency Attestation**: Digital signatures and competency verification

## Project Structure
```
/client               - Vite React app (port 5000)
  /src/pages          - React page components
    TrainerToday.tsx  - Daily session management
    Library.tsx       - Training content management (9 tabs)
    TrainingHistory.tsx - Progress dashboard
    PrintSheet.tsx    - Printable training sheet
    TraineeQuiz.tsx   - Daily quiz interface
/server               - Express API (port 3000)
  /src/routes         - API routes
    library.ts        - Content CRUD (departments, roles, tasks, WIs, etc.)
    training.ts       - Session management, quiz generation
    trainees.ts       - Trainee management
  /src/db             - Database configuration
    schema.ts         - Drizzle ORM schema (13 tables)
/drizzle              - Database migrations
```

## Database Schema
- **departments** - Organizational units
- **roles** - Positions/job roles
- **tasks** - Individual training tasks
- **work_instructions** - WI documents with codes and revisions
- **critical_points** - Safety/quality checkpoints per WI
- **role_tasks** - Task assignments per role
- **facility_topics** - PPE, FOD, ITAR, etc.
- **quiz_questions** - MCQ, TF, SHORT question bank
- **trainees** - People being trained
- **daily_sessions** - Training session records with signatures
- **daily_task_blocks** - 4-step tracking + SOA notes
- **daily_quizzes** - Quiz attempts and scores
- **daily_quiz_answers** - Individual answer records

## Key Features
1. **Library Management** - Create/manage departments, roles, tasks, work instructions, critical points, facility topics, quiz questions, and trainees
2. **Training Sessions** - Start sessions, track 4-step completion, record SOA coaching notes
3. **Digital Attestation** - Trainer/trainee signatures and competency attestation
4. **Printable Sheets** - Browser-printable training documentation
5. **Auto-graded Quizzes** - 80% pass threshold, MCQ and TF auto-graded
6. **AI-Powered PDF Import** - Upload Work Instruction PDFs, AI extracts critical points and generates quiz questions automatically
7. **4-Day Training Plans** - Structured training programs with integrated facility topics and knowledge level tracking
8. **Trainer Training** - Comprehensive educational resource for trainers covering philosophy, 4-Step Model, S-O-A coaching, certification, and prohibited behaviors

**Training Plans Details:**
   - Trainers create plans selecting trainee, tasks, and facility topics
   - Topics have baseline and target knowledge levels (none/basic/intermediate/advanced)
   - Each day maps to a step in the 4-Step Method
   - Cross-training trainees can achieve deeper knowledge levels
   - Plan execution launches daily sessions with pre-configured tasks and topics

## AI Features (OpenAI via Replit AI Integrations)
- **PDF Import**: Upload Work Instruction PDFs to automatically extract text
- **Critical Point Extraction**: AI analyzes W/I content to identify safety, quality, and compliance checkpoints
- **Quiz Generation**: AI creates MCQ and True/False questions based on critical points
- **On-demand Quiz Regeneration**: Generate new quiz questions for existing W/Is with the wand button

## API Endpoints
- `GET/POST/PATCH/DELETE /api/library/departments`
- `GET/POST/PATCH/DELETE /api/library/roles`
- `GET/POST/PATCH/DELETE /api/library/work-instructions`
- `GET/POST/PATCH/DELETE /api/library/tasks`
- `GET/POST/PATCH/DELETE /api/library/critical-points`
- `GET/POST/PATCH/DELETE /api/library/role-tasks`
- `GET/POST/PATCH/DELETE /api/library/facility-topics`
- `GET/POST/PATCH/DELETE /api/library/quiz-questions`
- `GET/POST/DELETE /api/trainees`
- `GET /api/training/sessions`
- `POST /api/training/sessions/start`
- `GET /api/training/sessions/:id`
- `PATCH /api/training/sessions/:id/sign`
- `PATCH /api/training/task-blocks/:id`
- `POST /api/training/sessions/:id/quiz/generate`
- `POST /api/training/quizzes/:id/submit`
- `POST /api/import/work-instructions/import` - Upload PDF and trigger AI analysis
- `GET /api/import/work-instructions/import/:jobId` - Check import job status
- `POST /api/import/work-instructions/:wiId/generate-quiz` - Regenerate quiz from critical points
- `POST /api/import/facility-topics/import` - Upload document and trigger AI quiz generation
- `GET /api/import/facility-topics/import/:jobId` - Check facility topic import job status
- `POST /api/import/facility-topics/:topicId/generate-quiz` - Regenerate quiz for facility topic

## Scripts
- `npm run dev` - Start both client and server
- `npm run db:push` - Push schema changes to database

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)
- `NODE_ENV` - Environment mode
- `SESSION_SECRET` - Session management secret
