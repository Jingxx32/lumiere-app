type Props = {
  praise: string[];
};

export function PraiseCard({ praise }: Props) {
  if (praise.length === 0) return null;

  return (
    <div className="bg-success-soft rounded-xl border border-success/20 p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-success font-medium">
        Well done
      </div>
      <ul className="space-y-1.5">
        {praise.map((sentence, i) => (
          <li key={i} className="text-sm text-foreground leading-relaxed">
            {sentence}
          </li>
        ))}
      </ul>
    </div>
  );
}
