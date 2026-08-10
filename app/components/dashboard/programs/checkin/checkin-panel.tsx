"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import CheckInManualForm from "@/app/components/dashboard/programs/checkin/checkin-manual-form";
import CheckInRecentList from "@/app/components/dashboard/programs/checkin/checkin-recent-list";
import CodeScanner from "@/app/components/molecules/code-scanner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import useRecentCheckIns from "@/app/hooks/use-recent-check-ins";
import type { AttendanceMethod } from "@/app/lib/programs/definitions";
import { checkInTicket } from "@/app/lib/programs/checkin-actions";
import {
  dismissCheckInVerdict,
  showCheckInVerdict,
} from "@/app/lib/programs/checkin-verdict-toast";

type Props = { occurrenceId: number };

/**
 * Owns everything the door screen shares: the in-flight scan and the short
 * history. The scanner and the manual input are two ways into the same submit,
 * so a code typed by hand goes through exactly the checks a scanned one does —
 * only `method` differs, and that is recorded.
 *
 * The verdict itself is a toast rather than anything held here, so that an
 * answer arriving between two scans cannot shift the camera being aimed.
 */
export default function CheckInPanel({ occurrenceId }: Props) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Survives a reload of the door screen; see the hook for why it is a store
  // rather than state.
  const {
    items: recent,
    add: addRecent,
    clear: clearRecent,
  } = useRecentCheckIns(occurrenceId);

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

        showCheckInVerdict(res.result);
        addRecent(res.result);
      });
    },
    [occurrenceId, addRecent],
  );

  const handleScan = useCallback(
    (code: string) => submit(code, "qr_scan"),
    [submit],
  );

  /**
   * Drops the on-screen history. Safe to offer without a confirmation because
   * nothing is lost: every scan is already an attendance row, and the occurrence
   * roster is the list that matters.
   */
  const handleClear = useCallback(() => {
    dismissCheckInVerdict();
    clearRecent();
  }, [clearRecent]);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-3">
        {/* Input first, camera below it: opening the camera then has nowhere
            to push the control the operator just used. */}
        <CheckInManualForm
          onSubmit={(code) => submit(code, "manual_code")}
          disabled={pending}
          scannerOpen={scannerOpen}
          onToggleScanner={setScannerOpen}
        />

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
          <CheckInRecentList items={recent} onClear={handleClear} />
        </CardContent>
      </Card>
    </div>
  );
}
