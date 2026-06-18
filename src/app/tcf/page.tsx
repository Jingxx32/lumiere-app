import Link from "next/link";
import { Headphones, BookOpenText } from "lucide-react";
import { getTcfLevelSummaries, listTcfSets, type TcfLevel } from "@/lib/actions/tcf";
import { Card } from "@/components/ui/card";

const LEVEL_COLORS: Record<TcfLevel, { bg: string; text: string; border: string }> = {
  A1: { bg: "bg-success-soft", text: "text-success", border: "border-success/30" },
  A2: { bg: "bg-success-soft", text: "text-success", border: "border-success/30" },
  B1: { bg: "bg-warning-soft", text: "text-warning", border: "border-warning/30" },
  B2: { bg: "bg-warning-soft", text: "text-warning", border: "border-warning/30" },
  C1: { bg: "bg-accent-soft", text: "text-accent", border: "border-accent/30" },
  C2: { bg: "bg-accent-soft", text: "text-accent", border: "border-accent/30" },
};

const LEVEL_LABELS: Record<TcfLevel, string> = {
  A1: "Débutant",
  A2: "Élémentaire",
  B1: "Intermédiaire",
  B2: "Avancé",
  C1: "Supérieur",
  C2: "Maîtrise",
};

const SKILLS = {
  listening: { label: "Écoute", title: "Compréhension orale", icon: Headphones, levelVerb: "Écoute" },
  reading: { label: "Lecture", title: "Compréhension écrite", icon: BookOpenText, levelVerb: "Lecture" },
} as const;

export default async function TcfPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string }>;
}) {
  const { skill: skillParam } = await searchParams;
  const skill = skillParam === "reading" ? "reading" : "listening";
  const meta = SKILLS[skill];
  const Icon = meta.icon;

  const [summaries, sets] = await Promise.all([
    getTcfLevelSummaries(skill),
    listTcfSets(skill),
  ]);

  return (
    <>
      <div className="flex items-end gap-3 mb-2">
        <Icon className="h-8 w-8 text-accent mb-0.5" strokeWidth={1.6} />
        <h1 className="font-serif text-4xl font-semibold tracking-tight">TCF Canada</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{meta.title} — par niveau CECR</p>

      <h2 className="text-xs uppercase tracking-widest text-subtle-foreground font-medium mb-4">
        {meta.levelVerb} · Choisissez un niveau
      </h2>

      {summaries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
          <p className="font-serif text-xl text-foreground">Aucune question disponible.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Importez les exercices pour commencer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {summaries.map((s) => {
            const colors = LEVEL_COLORS[s.level];
            return (
              <Link
                key={s.level}
                href={`/tcf/drill?skill=${skill}&level=${s.level}`}
                className="group block"
              >
                <Card
                  className={`px-6 py-5 transition-all group-hover:shadow-sm group-hover:border-accent/40 ${
                    s.total === 0 ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-sm font-bold font-mono ${colors.bg} ${colors.text}`}
                    >
                      {s.level}
                    </span>
                    {s.total > 0 && (
                      <span className="text-[11px] text-subtle-foreground">{s.total} q.</span>
                    )}
                  </div>
                  <p className="font-serif text-base font-semibold text-foreground leading-tight">
                    {LEVEL_LABELS[s.level]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.total === 0
                      ? "Pas encore disponible"
                      : `${s.sets} test${s.sets > 1 ? "s" : ""}`}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {sets.length > 0 && (
        <>
          <h2 className="mt-12 text-xs uppercase tracking-widest text-subtle-foreground font-medium mb-4">
            Examen blanc · Choisissez un test
          </h2>
          <p className="text-sm text-muted-foreground mb-4 -mt-2">
            Un test complet de 39 questions (A1 → C2), avec score à la fin.
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {sets.map((s) => (
              <Link
                key={s.id}
                href={`/tcf/exam?skill=${skill}&test=${s.testNumber}`}
                className="group flex flex-col items-center justify-center rounded-xl border border-border/70 bg-surface px-2 py-3 transition-all hover:border-accent/40 hover:shadow-sm"
              >
                <span className="font-serif text-lg font-semibold text-foreground group-hover:text-accent">
                  {s.testNumber}
                </span>
                <span className="text-[10px] text-subtle-foreground">{s.totalCount} q.</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
