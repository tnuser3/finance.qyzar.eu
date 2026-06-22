import ApiStatusPanel from "@/components/overview/api-status-panel";
import { SectionLabel } from "@/components/ui/section-label";
import { motionEnterDelay } from "@/lib/motion";

export default function PreferencesPage() {
  return (
    <main className="flex min-h-full flex-col gap-8 p-6 sm:p-8">
      <div>
        <SectionLabel className="mb-2">Preferences</SectionLabel>
        <p className="text-sm text-muted-foreground">
          Personalize your workspace. Additional settings will be available here soon.
        </p>
      </div>
      <ApiStatusPanel className={motionEnterDelay(0)} />
    </main>
  );
}
