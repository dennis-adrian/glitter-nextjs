import { Metadata } from "next";

import UnsubscribeCard from "@/app/components/emails/unsubscribe-card";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { maskEmail } from "@/app/lib/emails/mask-email";
import {
  isUnsubscribed,
  recipientAddress,
} from "@/app/lib/emails/suppressions";
import { EMAIL_TOPIC_LABELS } from "@/app/lib/emails/topics";
import { verifyUnsubscribeToken } from "@/app/lib/emails/unsubscribe-tokens";

export const metadata: Metadata = {
  title: "Darse de baja",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Where the "Darme de baja" link at the foot of bulk emails lands. */
export default async function Page(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;
  const subject = verifyUnsubscribeToken(token);
  const address = subject ? await recipientAddress(subject) : null;

  return (
    <div className="container flex min-h-[60vh] items-center justify-center p-4 md:p-6">
      {subject && address && token ? (
        <UnsubscribeCard
          token={token}
          maskedEmail={maskEmail(address)}
          topicLabel={EMAIL_TOPIC_LABELS[subject.topic]}
          unsubscribed={await isUnsubscribed(address, subject.topic)}
        />
      ) : (
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Este enlace no es válido</CardTitle>
            <CardDescription>
              Si quieres dejar de recibir nuestros correos, escríbenos a{" "}
              <a
                href="mailto:soporte@productoraglitter.com"
                className="font-medium underline"
              >
                soporte@productoraglitter.com
              </a>{" "}
              y te daremos de baja.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
