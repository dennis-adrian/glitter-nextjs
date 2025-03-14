import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { sendUserEmailsTemp } from "@/app/data/festivals/actions";
import { fetchUserProfilesByEmails } from "@/app/lib/users/actions";
import { useForm } from "react-hook-form";

const userEmails = [
  "joseignaciodaza55@gmail.com",
  "xt.rata666@gmail.com",
  "elisarwiz@gmail.com",
  "samielsanchez06@gmail.com",
  "asamivtalpha@gmail.com",
  "zoe.rojas8545@gmail.com",
  "khwzvoff936@gmail.com",
  "todalabellezanoesigual@gmail.com",
  "yucracnj@ueb.edu.bo",
  "panchosweb@gmail.com",
  "tearscolors@gmail.com",
  "mariacelesteballoncardozo@gmail.com",
  "sococoart@gmail.com",
  "guaman.cespedes.maria.cecilia@gmail.com",
  "keveddporsiempre@gmail.com",
  "owoturtleowo@gmail.com",
  "camilalucianaaragoninturias@gmail.com",
  "brendamirandah61@gmail.com",
  "marcoguzmanmontalvan@gmail.com",
  "mariajcamachoeid@gmail.com",
  "0019.brenda.paco@gmail.com",
  "montoyagarciav@gmail.com",
  "idkjuxu@gmail.com",
  "jay.tehblissfultree@gmail.com",
  "katiesoliz882@gmail.com",
  "jhonsebastianguarachi@gmail.com",
  "chrisminez22@gmail.com",
  "minimichoso@gmail.com",
  "anahiticona.10@gmail.com",
  "usitaremy@gmail.com",
  "ady9637@gmail.com",
  "camilabustillos.q@gmail.com",
  "laura666bm@gmail.com",
  "chemita.princesa.love@gmail.com",
  "mollinedoleyha@gmail.com",
  "teffyleft1@gmail.com",
  "mamasat4n@gmail.com",
  "amira.endara@gmail.com",
  "nairishsc@gmail.com",
  "nashsandra380@gmail.com",
  "miette.moreno.cespedes@gmail.com",
  "gojirispinnaple13@gmail.com",
  "mrbluecreativestudio@gmail.com",
  "marraquetaperalta@gmail.com",
  "ninojosemalocr3@gmail.com",
  "alexanvargas2001@gmail.com",
  "kuzmiamy@gmail.com",
  "mariana.san101@gmail.com",
  "rubitugemafav36@gmail.com",
  "kawiiisabell@gmail.com",
  "natialiaga01@gmail.com",
  "jorgecatacora@gmail.com",
  "nicoleveliz2020@gmail.com",
  "hizcore@gmail.com",
  "bdsouzapintocrespo@gmail.com",
  "ashleykiribey9869@gmail.com",
  "fernandacalz14@gmail.com",
  "shinyopals@gmail.com",
  "dokomiki@gmail.com",
  "corp.vc16@gmail.com",
  "www.sofiaaguilarurbano@gmail.com",
  "aquilesmenacho2004@gmail.com",
  "deutschlanddee1@gmail.com",
  "bnayeonista@gmail.com",
  "soyquelita12@gmail.com",
  "sebas101art@gmail.com",
  "chcaomy@gmail.com",
  "aliagacristal@gmail.com",
  "nathaliaquirogae@gmail.com",
  "shadepriestess@gmail.com",
  "natalia.montaniv@gmail.com",
  "coffeebreaktimeh@gmail.com",
  "hyeonmy123@gmail.com",
  "pandaorejonmorado@gmail.com",
  "joaquinyanezbejaranokd@gmail.com",
  "geraldinrojas998@gmail.com",
  "caskyllo@gmail.com",
  "dayis.cerezo@gmail.com",
  "adeling1212@gmail.com",
  "cottonsugar240@gmail.com",
  "marilaucanelas@gmail.com",
  "marcosdavidventura@gmail.com",
  "pao.mor.so@gmail.com",
  "altunadaylin@gmail.com",
  "luciahumzugelly@gmail.com",
  "miguelagartgel@gmail.com",
  "saturnina.design@gmail.com",
  "quirogalucas551@gmail.com",
  "strawdool@outlook.com",
  "mecmac0512@gmail.com",
  "camila.condarco@gmail.com",
  "cecedelgado@gmail.com",
  "lafresitaart@gmail.com",
  "nicolbalderramalizarraga@gmail.com",
  "jazmineparrabarba2004@gmail.com",
  "estebangohanabud@gmail.com",
  "mothmeimei@gmail.com",
  "pepesabeingles@gmail.com",
  "a2016118326@estudiantes.upsa.edu.bo",
  "henry8rg@gmail.com",
  "jujulut7@gmail.com",
  "blackleoog18@gmail.com",
  "diegovilarfranco@gmail.com",
  "mateo.miranda.o8@gmail.com",
  "latricia.sj.88@gmail.com",
  "losdibujitosdegave@gmail.com",
  "ibihuwu@gmail.com",
  "pattataarmada@gmail.com",
  "dennisguzmanbo@gmail.com",
  "erika.chambilla@gmail.com",
  "exuvia.art@gmail.com",
  "suyanakamay@gmail.com",
  "alejandrabe707@gmail.com",
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
