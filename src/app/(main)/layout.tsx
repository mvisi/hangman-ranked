import Link from "next/link";
import Navbar from "@/components/Navbar";

const Layout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="text-muted-foreground hidden border-t py-6 text-center text-xs md:block">
        Hangman Ranked ·{" "}
        <Link href="/privacy" className="hover:text-foreground underline-offset-4 hover:underline">
          Privacy
        </Link>
      </footer>
    </div>
  );
};
export default Layout;
