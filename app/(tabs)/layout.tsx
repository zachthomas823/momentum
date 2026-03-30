import { Shell } from "@/components/Shell";
import { FitbitAutoSync } from "@/components/FitbitAutoSync";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FitbitAutoSync />
      <main className="flex-1 px-4 pt-4 pb-24">{children}</main>
      <Shell />
    </>
  );
}
