import { FamilyProvider } from "@/components/family-provider";
import { AppChrome } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <FamilyProvider>
        <AppChrome>{children}</AppChrome>
      </FamilyProvider>
    </div>
  );
}
