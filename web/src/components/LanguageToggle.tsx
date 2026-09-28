import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lang, setLang, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// 두 언어뿐이라 누를 때마다 전환한다. 라벨은 현재 언어를 보여준다.
export function LanguageToggle({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("h-8 gap-1 px-2 text-xs text-muted-foreground", className)}
      onClick={() => setLang(lang === "ko" ? "en" : "ko")}
      aria-label={t("lang.switch")}
      title={t("lang.switch")}
    >
      <Languages className="size-3.5" />
      {lang === "ko" ? "KO" : "EN"}
    </Button>
  );
}
