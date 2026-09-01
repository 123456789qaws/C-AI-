# Evidence: Improve-7 Teacher/Admin Pages

## Date: 2026-09-01

## Summary

Implemented teacher/admin pages for class management, student enrollment, task assignment, and admin bulk import.

## Files Created/Modified

### New Files
- `src/components/class/ClassCard.tsx` — Reusable class card with copyable code + metadata
- `src/components/class/AssignmentForm.tsx` — Form for teacher to assign tasks to classes with deadline
- `src/components/class/ImportForm.tsx` — Admin bulk import form (JSON/CSV, drag-drop, file upload)
- `src/app/classes/page.tsx` — Student page: join class by code + view assigned tasks with countdown
- `src/app/classes/[id]/page.tsx` — Teacher page: view enrollments + assign tasks + existing assignments

### Modified Files
- `src/app/(teacher)/dashboard/page.tsx` — Added class management section (create/list/view enrollments) + task assignment section (select task/class/deadline)
- `src/app/admin/page.tsx` — Functional import page with ImportForm + classes table + system config

## Functionality

### Teacher Dashboard (Extended)
- **Class Management**: Create new classes (auto-generates 6-char code), list classes with enrollment/assignment counts, view student list per class, link to class detail page
- **Task Assignment**: Select task (fib_L2 / linked_list_reverse) + class + optional deadline, POST to /api/assignments, view existing assignments per class
- **Preserved**: Heatmap, timeline, stats cards, CSV export, override buttons, Luna panel

### Student Classes Page (`/classes`)
- **Join Class**: Form with 6-character code input (auto-uppercase), POST to /api/classes/join
- **View Assignments**: Fetches GET /api/assignments/student, groups by class, shows deadline countdown (urgent in red, expired greyed)
- **Start Task**: Button links to task page

### Teacher Class Detail Page (`/classes/[id]`)
- **Enrollments**: Table with student ID, name, joined date
- **Create Assignment**: Form with task/class/deadline (class pre-selected)
- **Existing Assignments**: Table with task name, assigned date, deadline

### Admin Page (`/admin`)
- **Bulk Import**: JSON or CSV format, file upload + drag-drop, shows results (success/failed/errors)
- **Classes Table**: All classes with teacher, enrollment count, assignment count, detail link
- **System Config**: Placeholder for Provider status

## API Endpoints Used
- GET/POST /api/classes (teacher create/list)
- POST /api/classes/join {code} (student join)
- GET /api/classes/[id]/enrollments (teacher view students)
- POST /api/assignments {taskId, classId, deadline?} (teacher assign)
- GET /api/assignments?classId= (teacher list assignments)
- GET /api/assignments/student (student view assignments)
- POST /api/admin/import {users: [...]} (admin bulk import)

## Verification
- ✅ pnpm lint — No ESLint warnings or errors
- ✅ pnpm build — Compiled successfully, 23 pages generated
- ✅ Route table: /classes (4.33 kB), /classes/[id] (4.29 kB), /dashboard (8.38 kB), /admin (5.17 kB)
- ✅ All API routes registered: /api/classes, /api/classes/[id]/enrollments, /api/classes/join, /api/assignments, /api/assignments/student, /api/admin/import

## Design System Compliance
- Used existing Card, CardHeader, CardTitle, CardContent, CardDescription, Button components
- CSS variables via Tailwind: bg-background, text-foreground, text-muted-foreground, border-border, bg-card, bg-muted, text-primary, etc.
- Consistent spacing: gap-3/4/6, px-3 py-2, rounded-lg
- Dark/light compatible via CSS variables
- Scrollable containers with max-h + overflow-y-auto
