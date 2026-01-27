# ChronoStep

**Personal task tracking with hierarchical steps and time-aware work logging**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-14.1.0-black)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-11.0.1-orange)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue)](https://www.typescriptlang.org/)

---

## About

ChronoStep is a personal task-tracking web application designed to help you break down work into **Tasks → Steps → Substeps** and log **what you do and when you do it**. It's intentionally simple, fast, and focused on individual productivity rather than complex project management.

Unlike heavyweight PM tools, ChronoStep emphasizes clarity, tracking, and execution. It gives you a structured way to organize your work hierarchically while maintaining a chronological record of your progress through timestamped work logs.

Built with modern web technologies and Firebase for authentication and data storage, ChronoStep keeps your data secure and isolated per user, making it ideal for developers and professionals who prefer a lightweight, structured workflow.

---

## Features

- **Hierarchical Task Organization** - Break down work into Tasks, Steps, and nested Substeps with clear ordering
- **Work Logging** - Record notes, start/stop timers, and track duration with timestamped entries
- **Timeline View** - See a chronological view of all your activity across tasks with filtering by month/year and tags
- **Today View** - Focus on tasks and steps due today to stay on track
- **Insights Dashboard** - Visualize upcoming deadlines and recent activity for active tasks, plus priority distribution, tag summaries, and an interactive calendar
- **Task Search & Filters** - Search by title, description, or tags; filter by status (active, todo, in progress, done, blocked)
- **Priority Management** - Organize tasks by priority (low, medium, high) with automatic sorting
- **Firebase Authentication** - Secure email/password authentication with per-user data isolation
- **Firestore Security** - Robust security rules ensure users can only access their own data

---

## Quick Start

Get ChronoStep running locally in 5 steps:

1. **Prerequisites**: Node.js 18+ and a Firebase account ([free tier](https://firebase.google.com/pricing))
2. **Clone the repository**:
   ```bash
   git clone https://github.com/[username]/chronostep.git
   cd chronostep
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Configure Firebase**: Set up a Firebase project and add credentials to `.env` (see [SETUP.md](./SETUP.md))
5. **Run the app**:
   ```bash
   npm run dev
   ```

For detailed setup instructions, see [SETUP.md](./SETUP.md).

---

## Tech Stack

- **[Next.js](https://nextjs.org/)** 14.1.0 - React framework with App Router
- **[React](https://react.dev/)** 18.2.0 - UI library
- **[TypeScript](https://www.typescriptlang.org/)** 5.3.3 - Type-safe JavaScript
- **[Firebase](https://firebase.google.com/)** 11.0.1 - Authentication and Firestore database
- **[Tailwind CSS](https://tailwindcss.com/)** 3.4.1 - Utility-first CSS framework

**Architecture**: Client-side only, Next.js App Router, single data access layer (`useTaskStore` hook), fetch-on-demand data loading.

---

## Data Model

ChronoStep uses three main entities:

```typescript
interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority?: "low" | "medium" | "high";
  tags?: string[];
  dueDate?: string; // ISO 8601 format
  createdAt: string;
  updatedAt: string;
}

interface Step {
  id: string;
  userId: string;
  taskId: string;
  parentStepId?: string; // For nested substeps
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  order: number;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkLog {
  id: string;
  userId: string;
  taskId: string;
  stepId?: string;
  message?: string;
  tags: string[];
  type: "start" | "stop" | "note";
  timestamp: string;
  durationMinutes?: number;
}
```

All data is stored in Firestore with security rules enforcing per-user access.

---

## Documentation

- **[SETUP.md](./SETUP.md)** - Complete setup guide with Firebase configuration
- **[CLAUDE.md](./CLAUDE.md)** - Technical architecture and development reference
- **[LICENSE.md](./LICENSE.md)** - AGPL-3.0 license details

---

## Project Structure

```
chronostep/
├── src/
│   ├── app/               # Next.js App Router pages
│   │   ├── tasks/         # Task list and detail views
│   │   ├── today/         # Today's due items
│   │   ├── timeline/      # Chronological work log view
│   │   ├── report/        # Monthly reports
│   │   └── insights/      # Analytics dashboard
│   ├── components/        # Reusable UI components
│   │   ├── AuthGate.tsx   # Authentication wrapper
│   │   └── TopNav.tsx     # Global navigation
│   ├── hooks/             # Custom React hooks
│   │   ├── useAuth.tsx    # Firebase auth context
│   │   └── useTaskStore.ts # Data access layer
│   └── lib/               # Utilities and types
│       ├── types.ts       # TypeScript definitions
│       ├── firebaseClient.ts # Firebase initialization
│       └── insights.ts    # Report aggregation
├── public/                # Static assets
├── firestore.rules        # Firestore security rules
└── package.json           # Dependencies and scripts
```

---

## Project Status

**Version**: 0.1.0 (alpha)

**Current Features**: All core functionality is implemented and working:
- Task, step, and work log management
- Authentication and per-user data isolation
- Timeline, insights, and reporting views
- Search, filters, and priority sorting

**Known Limitations**:
- UI contains some mixed Italian/English text (being standardized)
- No real-time data sync (fetch-on-demand only)
- Performance may degrade with large datasets (all docs loaded per user)
- No automated tests
- Due dates use UTC midnight (timezone display may shift by a day)

See [CLAUDE.md](./CLAUDE.md) for detailed technical limitations and risks.

---

## Roadmap

Future enhancements under consideration:

- Drag-and-drop step ordering
- Pomodoro/focus mode with timer
- Advanced analytics (daily productivity, time per task)
- Data export to CSV/Markdown
- Calendar sync integrations
- Real-time data synchronization
- Multi-user/team support
- Internationalization (i18n) for full English UI
- Automated testing suite

---

## Development

### Available Scripts

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Create production build
npm run start    # Run production build locally
npm run lint     # Run ESLint
```

### Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test locally
5. Commit with clear messages (`git commit -m "Add feature: description"`)
6. Push to your fork (`git push origin feature/your-feature`)
7. Open a Pull Request

Please ensure:
- Code follows existing patterns and style
- TypeScript types are properly defined
- No console errors or warnings
- Documentation is updated if needed

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- You can use, modify, and distribute this software freely
- If you modify and deploy it as a web service, you must make the source code available
- Any derivative works must also be licensed under AGPL-3.0

See [LICENSE.md](./LICENSE.md) for the full license text.

---

## Support

Need help or found a bug?

- **Bug Reports**: [Open an issue](https://github.com/[username]/chronostep/issues)
- **Feature Requests**: [Open an issue](https://github.com/[username]/chronostep/issues)
- **Questions**: [Open a discussion](https://github.com/[username]/chronostep/issues)

---

## Philosophy

ChronoStep's goal is to be:

- **Minimal but powerful** - Focus on essential features without bloat
- **Structured but not rigid** - Hierarchical organization that adapts to your workflow
- **Local-first but extensible** - Your data, your control, with cloud backup
- **Developer-friendly and open** - Clean code, clear architecture, open source

It's your personal timeline of progress — one "step" at a time.

---

**Built with ❤️ for personal productivity**

Enjoy building with ChronoStep! 🚀
