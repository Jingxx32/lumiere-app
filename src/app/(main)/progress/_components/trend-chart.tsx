"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { CATEGORY_STYLES } from "@/lib/category-styles";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import type { TrendBucket } from "@/lib/actions/errors";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.keys(ERROR_TAXONOMY) as ErrorCategory[];
const WINDOWS = [30, 90, 365] as const;
type WindowDays = (typeof WINDOWS)[number];

type Props = {
  data: TrendBucket[];
  windowDays: WindowDays;
};

export function TrendChart({ data, windowDays }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setWindow(w: WindowDays) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", String(w));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  // Only render lines for categories with at least one non-zero data point
  const activeCategories = CATEGORIES.filter((cat) =>
    data.some((bucket) => (bucket[cat] as number | undefined) ?? 0 > 0),
  );

  const isEmpty = data.length === 0 || activeCategories.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold">Error trend</h2>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className={cn(
                "px-3 h-7 rounded-full text-xs transition-colors",
                w === windowDays
                  ? "bg-foreground text-background font-medium"
                  : "bg-surface text-muted-foreground hover:text-foreground border border-border/60",
              )}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="h-64 relative">
        {isEmpty ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No errors in this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (Number.isInteger(v) ? String(v) : "")}
                allowDecimals={false}
              />
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {activeCategories.map((cat) => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  name={ERROR_TAXONOMY[cat].label}
                  stroke={CATEGORY_STYLES[cat].chartColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
