"use client";

import {
  FlaskConicalIcon,
  MailWarningIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { PUSH_NOT_LAUNCHED_LINE } from "@/app/components/comunicados/admin/composer/composer-copy";
import PersonPicker from "@/app/components/comunicados/admin/composer/person-picker";
import type { ComposerPerson } from "@/app/components/comunicados/admin/composer/types";
import {
  channelsText,
  essentialResendText,
  newcomersText,
  RESEND_BUTTON_LABEL,
  RESEND_DIALOG_HINT,
  RESEND_ESSENTIAL_PEOPLE_TEXT,
  RESEND_FAILED_TEXT,
  RESEND_LOAD_FAILED_TEXT,
  resendActionLabel,
  resendEnvironmentText,
  resendRows,
  resendTypedPrompt,
} from "@/app/components/comunicados/admin/report/resend-copy";
import { typedCount } from "@/app/components/comunicados/admin/send-confirm-copy";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Skeleton } from "@/app/components/ui/skeleton";
import type { ComunicadoResendPreview } from "@/app/lib/comunicados/contracts";
import { COMUNICADO_RESEND_MAX_PEOPLE } from "@/app/lib/comunicados/definitions";
import {
  loadComunicadoResendPreviewAction,
  resendComunicadoAction,
  searchComunicadoResendPeopleAction,
} from "@/app/lib/comunicados/resend-actions";
import { cn } from "@/app/lib/utils";

/** Wait this long after the last change before counting again. */
const PREVIEW_DEBOUNCE_MS = 250;

type ResendDialogProps = {
  comunicadoId: number;
  title: string;
  /** The original send's channels: the dialog starts from them. */
  sentChannels: { email: boolean; push: boolean };
  essential: boolean;
  /** Whether `push_notifications` is public for participants. */
  pushLaunched: boolean;
};

type Loaded =
  | { status: "loading" }
  | { status: "error"; key: string }
  | { status: "done"; key: string; preview: ComunicadoResendPreview };

function Problem({ children }: { children: string }) {
  return (
    <p
      className="rounded-lg border border-[#E8356A] bg-[#E8356A]/10 p-3 text-sm"
      role="alert"
    >
      {children}
    </p>
  );
}

function Callout({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof MailWarningIcon;
  tone: "amber" | "blue";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 text-sm",
        tone === "amber"
          ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

function ChannelRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
  description,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange?.(value === true)}
        className="mt-0.5"
      />
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

/**
 * "Enviar a más personas" on a sent comunicado's page
 * (docs/IMPLEMENTATION-comunicados.md G10): the people new to its audience
 * since the send, people picked by name, or both, with the channels to use
 * this time. The numbers come fresh from the server whenever the choice
 * changes; the resend counts them again under its lock. A refusal stays in
 * the dialog, next to the numbers it is about.
 */
export default function ResendComunicadoButton({
  comunicadoId,
  title,
  sentChannels,
  essential,
  pushLaunched,
}: ResendDialogProps) {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [includeAudience, setIncludeAudience] = useState(true);
  const [people, setPeople] = useState<ComposerPerson[]>([]);
  const [sendEmail, setSendEmail] = useState(sentChannels.email);
  const [sendPush, setSendPush] = useState(sentChannels.push);
  const [typed, setTyped] = useState("");
  const [answer, setLoaded] = useState<Loaded>({ status: "loading" });
  const [refusal, setRefusal] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState("");
  const [reload, setReload] = useState(0);
  const latestRef = useRef(0);
  const peopleIds = people.map((person) => person.id);
  const peopleKey = peopleIds.join(",");
  // What the numbers are for: an answer for an earlier choice shows as
  // loading, so the button never confirms numbers for another choice.
  const choiceKey = `${includeAudience}|${peopleKey}|${sendEmail}|${sendPush}|${reload}`;
  const loaded: Loaded =
    answer.status !== "loading" && answer.key !== choiceKey
      ? { status: "loading" }
      : answer;

  const search = useCallback(
    (term: string) => searchComunicadoResendPeopleAction(comunicadoId, term),
    [comunicadoId],
  );

  /** Each opening starts over: the original's channels, nobody picked. */
  function changeOpen(next: boolean) {
    if (isPending) return;
    if (next) {
      setIncludeAudience(true);
      setPeople([]);
      setSendEmail(sentChannels.email);
      setSendPush(sentChannels.push);
      setTyped("");
      setRefusal(null);
      setLoaded({ status: "loading" });
      setRequestKey(crypto.randomUUID());
    } else if (refusal !== null) {
      router.refresh();
    }
    setOpen(next);
  }

  useEffect(() => {
    if (!open) return;
    latestRef.current += 1;
    const request = latestRef.current;
    const key = `${includeAudience}|${peopleKey}|${sendEmail}|${sendPush}|${reload}`;
    const timer = setTimeout(() => {
      loadComunicadoResendPreviewAction({
        comunicadoId,
        includeAudience,
        people: peopleKey ? peopleKey.split(",").map(Number) : [],
        sendEmail,
        sendPush,
      }).then(
        (result) => {
          if (request !== latestRef.current) return;
          setLoaded(
            result.success
              ? { status: "done", key, preview: result.preview }
              : { status: "error", key },
          );
        },
        (error: unknown) => {
          if (request !== latestRef.current) return;
          console.error("Error counting a comunicado's resend", error);
          setLoaded({ status: "error", key });
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    open,
    comunicadoId,
    includeAudience,
    peopleKey,
    sendEmail,
    sendPush,
    reload,
  ]);

  const preview =
    loaded.status === "done" && loaded.preview.ok ? loaded.preview : null;
  const blocker = loaded.status === "done" ? loaded.preview.problem : null;
  const typedOk =
    !preview?.typedRequired || typedCount(typed) === preview.eligible;
  const canSend =
    preview !== null && !blocker && typedOk && !isPending && requestKey !== "";
  const peopleFull =
    people.length >= COMUNICADO_RESEND_MAX_PEOPLE
      ? `Elegí hasta ${COMUNICADO_RESEND_MAX_PEOPLE} personas por nombre.`
      : null;

  function submit(shown: Extract<ComunicadoResendPreview, { ok: true }>) {
    setRefusal(null);
    startTransition(async () => {
      try {
        const result = await resendComunicadoAction({
          comunicadoId,
          includeAudience,
          people: peopleIds,
          sendEmail,
          sendPush,
          requestKey,
          expectEssential: shown.essential,
          typedCount: shown.typedRequired ? typedCount(typed) : null,
        });
        if (!result.success) {
          setRefusal(result.message);
          // The numbers changed under the dialog: count again.
          if (
            result.code === "AUDIENCE_CHANGED" ||
            result.code === "ESSENTIAL_CHANGED" ||
            result.code === "NOBODY"
          ) {
            setTyped("");
            setReload((n) => n + 1);
          }
          return;
        }
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Error resending a comunicado", error);
        setRefusal(RESEND_FAILED_TEXT);
      }
    });
  }

  const essentialText = preview ? essentialResendText(preview) : null;
  const environmentText = preview ? resendEnvironmentText(preview) : null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => changeOpen(true)}>
        <UsersIcon className="mr-2 h-4 w-4" aria-hidden />
        {RESEND_BUTTON_LABEL}
      </Button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="break-words">
              Enviar «{title}» a más personas
            </DialogTitle>
            <DialogDescription>{RESEND_DIALOG_HINT}</DialogDescription>
          </DialogHeader>

          <section className="space-y-3" aria-label="A quiénes">
            <ChannelRow
              id={`${ids}-audience`}
              label={
                preview && includeAudience
                  ? newcomersText(preview.newcomers)
                  : "Las personas nuevas en la audiencia desde el envío"
              }
              checked={includeAudience}
              disabled={isPending || essential}
              onCheckedChange={setIncludeAudience}
              description="Las listas y festivales del envío, calculados hoy."
            />

            {essential ? (
              <p className="text-xs text-muted-foreground">
                {RESEND_ESSENTIAL_PEOPLE_TEXT}
              </p>
            ) : (
              <div className="space-y-2">
                <PersonPicker
                  chosenIds={peopleIds}
                  fullReason={peopleFull}
                  disabled={isPending}
                  search={search}
                  onPick={(person) =>
                    setPeople((current) =>
                      current.some((p) => p.id === person.id)
                        ? current
                        : [...current, person],
                    )
                  }
                />
                {people.length > 0 && (
                  <ul
                    className="flex flex-wrap gap-1.5"
                    aria-label="Por nombre"
                  >
                    {people.map((person) => (
                      <li
                        key={person.id}
                        className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm"
                      >
                        <span className="max-w-[14rem] truncate">
                          {person.name}
                        </span>
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-muted"
                          disabled={isPending}
                          aria-label={`Quitar a ${person.name}`}
                          onClick={() =>
                            setPeople((current) =>
                              current.filter((p) => p.id !== person.id),
                            )
                          }
                        >
                          <XIcon className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3 border-t pt-4" aria-label="Canales">
            <ChannelRow id={`${ids}-app`} label="En la app" checked disabled />
            <ChannelRow
              id={`${ids}-email`}
              label="Por correo"
              checked={sendEmail}
              disabled={isPending}
              onCheckedChange={setSendEmail}
            />
            <ChannelRow
              id={`${ids}-push`}
              label="Notificación en el dispositivo"
              checked={sendPush}
              disabled={isPending}
              onCheckedChange={setSendPush}
              description={pushLaunched ? undefined : PUSH_NOT_LAUNCHED_LINE}
            />
            <p className="text-xs text-muted-foreground">
              Esta vez: {channelsText(sendEmail, sendPush)}.
            </p>
          </section>

          {loaded.status === "loading" ? (
            <div className="space-y-2" aria-busy="true">
              <p className="text-sm text-muted-foreground" role="status">
                Contando a quiénes les llega…
              </p>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : loaded.status === "error" ? (
            <Problem>{RESEND_LOAD_FAILED_TEXT}</Problem>
          ) : (
            <>
              {preview && (
                <dl className="divide-y rounded-lg border text-sm">
                  {resendRows(preview, { sendEmail, sendPush }).map((row) => (
                    <div
                      key={row.label}
                      className="grid gap-0.5 px-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3"
                    >
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd
                        className={cn(
                          "break-words",
                          row.strong && "font-semibold",
                        )}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {essentialText && (
                <Callout icon={MailWarningIcon} tone="amber">
                  {essentialText}
                </Callout>
              )}
              {environmentText && (
                <Callout icon={FlaskConicalIcon} tone="blue">
                  {environmentText}
                </Callout>
              )}
              {blocker ? (
                <Problem>{blocker}</Problem>
              ) : (
                preview?.typedRequired && (
                  <div className="space-y-2">
                    <label htmlFor={`${ids}-typed`} className="text-sm">
                      {resendTypedPrompt(preview.eligible)}
                    </label>
                    <Input
                      id={`${ids}-typed`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      disabled={isPending}
                    />
                  </div>
                )
              )}
            </>
          )}

          {refusal && <Problem>{refusal}</Problem>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => changeOpen(false)}
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={!canSend}
              onClick={() => {
                if (preview && canSend) submit(preview);
              }}
            >
              {isPending ? "Enviando…" : resendActionLabel(preview)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
