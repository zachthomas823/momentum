import { Shell } from "@/components/Shell";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="flex-1 px-4 pt-4 pb-24">{children}</main>
      <Shell />
    </>
  );
}
