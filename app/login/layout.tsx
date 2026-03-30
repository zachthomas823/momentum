export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4">
      {children}
    </main>
  )
}
