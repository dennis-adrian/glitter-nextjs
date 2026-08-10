"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import CheckInManualForm from "@/app/components/dashboard/programs/checkin/checkin-manual-form";
import CheckInRecentList, {
  type RecentCheckIn,
} from "@/app/components/dashboard/programs/checkin/checkin-recent-list";
import CheckInResultBanner from "@/app/components/dashboard/programs/checkin/checkin-result-banner";
import CodeScanner from "@/app/components/molecules/code-scanner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { AttendanceMethod } from "@/app/lib/programs/definitions";
import { checkInTicket } from "@/app/lib/programs/checkin-actions";

/** Enough to answer "did the last few go through" without becoming a report. */
const RECENT_LIMIT = 10;

type Props = { occurrenceId: number };

/**
 * Owns everything the door screen shares: the in-flight scan, the last verdict,
 * and the short history. The scanner and the manual input are two ways into the
 * same submit, so a code typed by hand goes through exactly the checks a
 * scanned one does — only `method` differs, and that is recorded.
 */
export default function CheckInPanel({ occurrenceId }: Props) {
  const [result, setResult] = useState<RecentCheckIn["result"] | null>(null);
  const [recent, setRecent] = useState<RecentCheckIn[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Scans can land inside the same millisecond; a counter keeps React keys
  // unique where a timestamp would not.
  const nextId = useRef(0);

  const submit = useCallback(
    (code: string, method: AttendanceMethod) => {
      startTransition(async () => {
        let res;
        try {
          res = await checkInTicket({ occurrenceId, code, method });
        } catch {
          toast.error("No pudimos registrar el ingreso. Intenta de nuevo.");
          return;
        }

        if (!res.success) {
          toast.error(res.message);
          return;
        }

        nextId.current += 1;
        const entry: RecentCheckIn = {
          id: nextId.current,
          at: new Date(),
          result: res.result,
        };

        setResult(res.result);
        setRecent((items) => [entry, ...items].slice(0, RECENT_LIMIT));
      });
    },
    [occurrenceId],
  );

  const handleScan = useCallback(
    (code: string) => submit(code, "qr_scan"),
    [submit],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-3">
        {/* Input first, camera below it: opening the camera then has nowhere to
            push the control the operator just used, and the verdict stays in
            the same place between a typed code and a scanned one. */}
        <CheckInManualForm
          onSubmit={(code) => submit(code, "manual_code")}
          disabled={pending}
          scannerOpen={scannerOpen}
          onToggleScanner={setScannerOpen}
        />

        {result ? <CheckInResultBanner result={result} /> : null}

        {scannerOpen ? (
          <CodeScanner
            onScan={handleScan}
            busy={pending}
            onClose={() => setScannerOpen(false)}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos escaneos</CardTitle>
        </CardHeader>
        <CardContent>
          <CheckInRecentList items={recent} />
        </CardContent>
      </Card>
    </div>
  );
}
