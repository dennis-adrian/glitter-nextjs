export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: 'calc(100vh - 64px)' }}>
      {children}
    </div>
  );
}
