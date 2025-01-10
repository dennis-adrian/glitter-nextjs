import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { sendUserEmailsTemp } from "@/app/data/festivals/actions";
import { fetchUserProfilesByEmails } from "@/app/lib/users/actions";
import { useForm } from "react-hook-form";

const userEmails = [
  "amira.endara@gmail.com",
  "miette.moreno.cespedes@gmail.com",
  "rubitugemafav36@gmail.com",
  "alexanvargas2001@gmail.com",
  "natialiaga01@gmail.com",
  "www.sofiaaguilarurbano@gmail.com",
  "coffeebreaktimeh@gmail.com",
  "chemita.princesa.love@gmail.com",
  "yucracnj@ueb.edu.bo",
  "vibraartistica@gmail.com",
  "panchosweb@gmail.com",
  "0019.brenda.paco@gmail.com",
  "camilalucianaaragoninturias@gmail.com",
  "mollinedoleyha@gmail.com",
  "marraquetaperalta@gmail.com",
  "brendamirandah61@gmail.com",
  "ashleykiribey9869@gmail.com",
  "luciahumzugelly@gmail.com",
  "idkjuxu@gmail.com",
  "shadepriestess@gmail.com",
  "chcaomy@gmail.com",
  "geraldinrojas998@gmail.com",
  "strawdool@outlook.com",
  "quirogalucas551@gmail.com",
  "joseignaciodaza55@gmail.com",
  "a2016118326@estudiantes.upsa.edu.bo",
  "khwzvoff936@gmail.com",
  "lafresitaart@gmail.com",
  "mrbluecreativestudio@gmail.com",
  "pixulcraft@gmail.com",
  "henry8rg@gmail.com",
  "caskyllo@gmail.com",
  "jay.tehblissfultree@gmail.com",
  "nathaliaquirogae@gmail.com",
  "miguelagartgel@gmail.com",
  "mariajcamachoeid@gmail.com",
  "jorgecatacora@gmail.com",
  "anahiticona.10@gmail.com",
  "kuzmiamy@gmail.com",
  "deutschlanddee1@gmail.com",
  "pandaorejonmorado@gmail.com",
  "joaquinyanezbejaranokd@gmail.com",
  "mateo.miranda.o8@gmail.com",
  "ninojosemalocr3@gmail.com",
  "owoturtleowo@gmail.com",
  "asamivtalpha@gmail.com",
  "exuvia.art@gmail.com",
  "mariacelesteballoncardozo@gmail.com",
  "elisarwiz@gmail.com",
  "camila.condarco@gmail.com",
  "katiesoliz882@gmail.com",
  "kawiiisabell@gmail.com",
  "aquilesmenacho2004@gmail.com",
  "marilaucanelas@gmail.com",
  "usitaremy@gmail.com",
  "mecmac0512@gmail.com",
  "jazmineparrabarba2004@gmail.com",
  "mothmeimei@gmail.com",
  "natalia.montaniv@gmail.com",
  "ibihuwu@gmail.com",
  "samielsanchez06@gmail.com",
  "keveddporsiempre@gmail.com",
  "laura666bm@gmail.com",
  "teffyleft1@gmail.com",
  "nicoleveliz2020@gmail.com",
  "tearscolors@gmail.com",
  "mamasat4n@gmail.com",
];

export default function SendMissingEmailsForm({
  festivalId,
}: {
  festivalId: number;
}) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const filteredEmails = Array.from(new Set(userEmails));
    const users = await fetchUserProfilesByEmails(filteredEmails);
    await sendUserEmailsTemp(users, festivalId);
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="flex flex-col gap-4 mt-4">
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
          loadingLabel="Enviando correos"
        >
          Enviar correos faltantes
        </SubmitButton>
      </form>
    </Form>
  );
}
