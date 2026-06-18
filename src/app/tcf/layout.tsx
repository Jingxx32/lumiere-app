import { Suspense } from "react";
import { TcfHeader } from "./_components/tcf-header";

export default function TcfLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<div className="h-[53px] border-b border-border/60" />}>
        <TcfHeader />
      </Suspense>
      <div className="w-full max-w-5xl mx-auto px-10 py-10">
        {children}
      </div>
    </div>
  );
}
