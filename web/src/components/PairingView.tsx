import { useState } from "react";
import type { FormEvent } from "react";
import { MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

export function PairingView({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const digits = code.replace(/\D/g, "");

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (digits.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.pair(digits);
      toast.success("페어링 완료");
      onPaired();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("코드가 일치하지 않습니다. 컴퓨터 화면의 코드를 확인하세요.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("시도 횟수가 너무 많습니다. 1분 후에 다시 시도하세요.");
      } else {
        setError("연결에 실패했습니다. 네트워크 상태를 확인하세요.");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border/70 bg-card/70 shadow-lg backdrop-blur">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MonitorSmartphone className="size-6" />
          </div>
          <CardTitle className="text-lg">Remote Anything</CardTitle>
          <CardDescription>Aside 데스크톱에 표시된 6자리 페어링 코드를 입력하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              aria-label="페어링 코드"
              className="h-14 text-center text-2xl tracking-[0.5em]"
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : null}
            <Button type="submit" disabled={digits.length !== 6 || submitting}>
              {submitting ? "연결 중..." : "연결"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
