import NavbarClient from "@/app/components/navbar/navbar-client";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <nav className="container m-auto flex h-16 w-full items-center px-4 py-3 md:h-20 md:px-6 md:py-4">
        <NavbarClient />
      </nav>
    </header>
  );
}
