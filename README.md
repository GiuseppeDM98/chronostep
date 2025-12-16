# Chronostep

Chronostep is a personal task‑tracking web application designed to help you break work down into **tasks → steps → substeps**, and to log **what you do and when you do it**.  
It is intentionally simple, fast, and local‑first, ideal for developers and professionals who prefer a lightweight, structured workflow instead of a complex project‑management tool.

---

## 🧭 Purpose

Chronostep is built to:

- Organize your work into clear hierarchical structures  
  (Tasks → Steps → Substeps)
- Record notes, actions, and progress with timestamped **Work Logs**
- Give you a chronological view of your activity through a **Timeline**
- Serve as a personal productivity companion without accounts, servers, or dependencies

It focuses on **clarity, tracking, and execution** rather than planning heavy workflows or teams.

---

## ✨ Latest updates

- Task detail view now include full editing for titles, descrizioni, priorità, tag e due date.
- Steps e substeps sono ordinati e richiamabili ovunque (dropdown di parent/WorkLog) con i rispettivi numeri.
- Work Logs mostrano badge di progress, durata stimata (start/stop) e link diretto alla nuova dashboard Insights.
- Aggiunta la pagina **Insights & Pianificazione** con focus rapido, prossime scadenze, attività recente, grafici per priorità/tag e calendario interattivo (cliccare i giorni apre l’elenco dei task con link).
- Barra di navigazione globale in tutte le pagine per accedere rapidamente a Home, Tasks, Timeline e Insights.

---

## 🏛 Architecture Overview

Chronostep is implemented using:

- **Next.js (App Router, TypeScript)**  
- **Firebase Authentication** to protect each workspace  
- **Firebase Firestore** as the persistence layer  
- **Tailwind CSS** for styling  
- Optional progressive enhancements like analytics and calendar sync

The design emphasizes:

- Local-first storage  
- Extensibility  
- Modular and reusable UI components  
- Clean separation of domain logic, views, and server actions

---

## 🗂 Main Concepts

### **Task**
A high-level activity or project you want to track.  
Contains metadata such as status, priority, tags, and deadlines.

### **Step**
A concrete action required to complete a task.  
Steps can recursively contain **substeps**. Each entry can also store an optional description to capture guidance or acceptance criteria.

### **Work Log**
A timestamped entry describing what happened at a moment in time.  
Useful for daily summaries, retrospectives, and tracking actual work done.

---

## 🧩 App Structure

All authenticated views now share a global top navigation bar with quick links to Home, Tasks, Timeline and Insights so you can hop between sections without backtracking.

### **Tasks List (`/tasks`)**
Displays all tasks with filters:
- Status (todo, in progress, done, blocked)
- Tags
- Priority
- Ordinamento automatico dalla priorità più urgente a quella meno urgente

### **Task Detail (`/tasks/[id]`)**
Includes:
- Task metadata
- Steps and nested substeps with their descriptions
- Inline task edit form (titolo, descrizione, status, priority, tag, due date)
- Work log timeline
- Inline controls to edit/delete steps, substeps, and work logs
- Forms to add/update everything

### **Timeline (`/timeline`)**
A chronological journal of all logged activity across tasks, enriched with progress badges, durata calcolata dagli start/stop e link rapidi alla dashboard Insights.

### **Insights & Pianificazione (`/insights`)**
Reports e pianificazione personale:
- Focus rapido richiamabile dai Work Log
- Prossime scadenze e attività recente
- Grafici di carico per priorità e tag
- Calendario mensile interattivo: clicca un giorno per espandere i task con link diretto

### **Settings (`/settings`)**
Reserved for future improvements:
- Data export
- Backup/restore
- Theme customization

---

## 🔧 Data Model (Firebase Firestore)

Chronostep stores everything inside a Firebase project:

- `tasks` collection  
  Stores metadata, tags, and due dates for every task document.
- `steps` collection  
  Holds the ordered steps/substeps linked by `taskId` and `parentStepId`.
- `workLogs` collection  
  Keeps timestamped notes tied to either a task or a particular step.

Documents are materialized in the UI through the strongly typed models in `src/lib/types.ts`. Security rules can scope documents per user when multi-tenant support is introduced.

---

## 🚀 Future Enhancements

- Step drag & drop ordering  
- Pomodoro / Focus mode  
- Analytics (daily productivity, time per task)  
- Export to CSV / Markdown  
- Calendar sync  
- Multi-user support  

---

## 📦 Development Setup

1. Install dependencies  
   ```bash
   npm install
   ```
2. Configure Firebase  
   - Create a Firebase project with Authentication (Email/Password) and Firestore enabled.  
   - Register a Web App entry to obtain API keys for the client SDK.  
   - Generate a service account key and copy `project_id`, `client_email`, and `private_key`.  
   - Fill the `.env` file with the values (remember to escape newlines in the private key using `\n`).
3. Run the dev server  
   ```bash
   npm run dev
   ```

---

## 📄 Project Philosophy

Chronostep’s goal is to be:

- **Minimal but powerful**  
- **Structured but not rigid**  
- **Local-first but extensible**  
- **Developer-friendly and open**

It’s your personal timeline of progress — one “step” at a time.

---

Enjoy building and evolving Chronostep 🚀
