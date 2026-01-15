import Link from "next/link";
import AuthGate from "../components/AuthGate";

// CTA cards drive navigation to the three core areas of the app.
const CTA_LINKS = [
  { href: "/tasks", label: "View Tasks", description: "Manage tasks, filters, and progress" },
  { href: "/timeline", label: "Timeline", description: "See your work logs chronologically" },
  { href: "/report", label: "Report", description: "Monthly report by task" },
  { href: "/insights", label: "Insights", description: "Focus planning e carico del team" },
];

// Home content sits behind AuthGate to keep the entry experience authenticated.
const HomePage = () => (
  <AuthGate>
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-16">
      <section className="rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-100">
        <p className="text-sm uppercase tracking-widest text-slate-500">Chronostep</p>
        <h1 className="mt-2 text-4xl font-semibold text-slate-900">
          Break work into steps, stay accountable with logs.
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Chronostep è un diario operativo. Traccia task, sub-task e sessioni di lavoro senza
          distrazioni.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          {CTA_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex flex-col rounded-2xl border border-slate-200 px-6 py-4 transition hover:-translate-y-1 hover:border-slate-900 hover:bg-slate-900 hover:text-white"
            >
              <span className="text-lg font-semibold">{link.label}</span>
              <span className="text-sm text-slate-500 group-hover:text-slate-200">
                {link.description}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Tasks",
            body: "Organizza lavoro per status, priority e tag. Ogni task è una piccola roadmap.",
          },
          {
            title: "Steps",
            body: "Scomponi i task in Azioni. Supporto per substep e ordine personalizzato.",
          },
          {
            title: "Work Logs",
            body: "Registra note, start/stop e durata per ricostruire giornate senza fatica.",
          },
        ].map((card) => (
          <article
            key={card.title}
            className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-slate-100"
          >
            <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{card.body}</p>
          </article>
        ))}
      </section>
    </main>
  </AuthGate>
);

export default HomePage;
