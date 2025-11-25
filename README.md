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

## 🏛 Architecture Overview

Chronostep is implemented using:

- **Next.js (App Router, TypeScript)**  
- **SQLite** as the persistence layer  
- **Prisma ORM** for database access  
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
Steps can recursively contain **substeps**.

### **Work Log**
A timestamped entry describing what happened at a moment in time.  
Useful for daily summaries, retrospectives, and tracking actual work done.

---

## 🧩 App Structure

### **Dashboard**
Quick overview of:
- Tasks in progress
- Logs from today
- Fast actions (new task, new log)

### **Tasks List (`/tasks`)**
Displays all tasks with filters:
- Status (todo, in progress, done, blocked)
- Tags
- Priority

### **Task Detail (`/tasks/[id]`)**
Includes:
- Task metadata
- Steps and nested substeps
- Work log timeline
- Forms to add/update everything

### **Timeline (`/timeline`)**
A chronological journal of all logged activity across tasks.

### **Settings (`/settings`)**
Reserved for future improvements:
- Data export
- Backup/restore
- Theme customization

---

## 🔧 Database Schema (Prisma + SQLite)

Chronostep uses a structured relational schema designed around:

- `Task`
- `Step` (with recursive self-relation)
- `WorkLog`
- Enums for status, priority, and log types

The database is local by default and can later be swapped for Postgres/Supabase if multi-device sync is needed.

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

2. Set up the SQLite database  
   ```bash
   npx prisma migrate dev
   ```

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
