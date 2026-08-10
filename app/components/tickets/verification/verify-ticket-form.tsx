"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import CodeScanner, {
  type ScanFormat,
} from "@/app/components/molecules/code-scanner";
import CodeScannerToggle from "@/app/components/molecules/code-scanner-toggle";
import SubmitButton from "@/app/components/simple-submit-button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { verifyTicket } from "@/app/data/tickets/actions";
import { parseTicketNumber } from "@/app/lib/tickets/utils";

const FormSchema = z.object({
  ticketCode: z.string().trim().min(1, {
    error: "El código de entrada es requerido",
  }),
});

/**
 * A festival ticket is emailed as a QR and rendered in the app as a CODE_128
 * barcode, both carrying the same `GLT-0012` string. The desk sees whichever
 * one the visitor happens to have, so the reader has to accept both.
 */
const SCAN_FORMATS: ScanFormat[] = ["qr_code", "code_128"];

export default function VerifyTicketForm({
  festivalId,
}: {
  festivalId: number;
}) {
  const [scannerOpen, setScannerOpen] = useState(false);
  /**
   * Tracked here rather than read off `formState.isSubmitting`, because a
   * scanned code never travels through the form's submit and would otherwise
   * leave the camera unblocked while its own verification is in flight.
   */
  const [verifying, setVerifying] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      ticketCode: "",
    },
  });

  useEffect(() => {
    form.setFocus("ticketCode");
  }, [form, form.setFocus]);

  /**
   * The single path a code takes, whoever produced it: typing and scanning
   * differ only in whether the operator gets the caret back afterwards.
   */
  const verify = useCallback(
    async (rawCode: string, source: "manual" | "scan") => {
      const ticketNumber = parseTicketNumber(rawCode);
      if (ticketNumber === null) {
        toast.error("Código de entrada inválido", {
          position: "top-right",
        });
        return;
      }

      setVerifying(true);
      try {
        const res = await verifyTicket(ticketNumber, festivalId);
        if (res.success) {
          toast.success(res.message, {
            position: "top-right",
          });
        } else {
          toast.error(res.message, {
            position: "top-right",
          });
        }
      } catch {
        toast.error("No pudimos verificar la entrada. Intenta de nuevo.", {
          position: "top-right",
        });
      } finally {
        setVerifying(false);
      }

      form.setValue("ticketCode", "");

      // Focus raises the on-screen keyboard, which on a phone covers the camera
      // the operator is about to point at the next ticket. Only give it back to
      // the person who was actually typing.
      if (source === "manual") form.setFocus("ticketCode");
    },
    [festivalId, form],
  );

  const action = form.handleSubmit(async (data) => {
    await verify(data.ticketCode, "manual");
  });

  const handleScan = useCallback(
    (code: string) => {
      void verify(code, "scan");
    },
    [verify],
  );

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={action}>
        <FormField
          name="ticketCode"
          render={({ field }) => (
            <FormItem className="w-full grid gap-2">
              <FormLabel>Código de entrada</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input
                    placeholder="Ingresa o escanea el código"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <CodeScannerToggle
                  open={scannerOpen}
                  onToggle={setScannerOpen}
                  disabled={verifying}
                />
              </div>
              <FormDescription>
                Puedes ingresar el código manualmente. Los dígitos después del
                guión (-) o barra (/)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton
          loading={verifying}
          disabled={verifying}
          label="Verificar"
        />

        {scannerOpen ? (
          <CodeScanner
            onScan={handleScan}
            busy={verifying}
            onClose={() => setScannerOpen(false)}
            formats={SCAN_FORMATS}
          />
        ) : null}
      </form>
    </Form>
  );
}
