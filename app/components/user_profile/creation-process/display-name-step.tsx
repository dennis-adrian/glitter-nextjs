import { ProfileType } from "@/app/api/users/definitions";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import DisplayNameForm from "@/app/components/user_profile/creation-process/display-name-form";

type DisplayNameStepProps = {
  profile: ProfileType;
};
export default function DisplayNameStep(props: DisplayNameStepProps) {
  let title = "¿Cuál es tu nombre de artista?";
  let namePlaceholder = "Ej. Dibujitos de Carla, Express Art, etc.";
  let descriptionSnippet = "Agrega tu nombre de artista o con el que te reconocen en redes sociales y una bio compartiendo un poco sobre ti y tus intereses.";
  if (props.profile.category === "entrepreneurship") {
    title = "¿Cuál es el nombre de tu emprendimiento?";
    namePlaceholder = "Ej. Tejidos y Crochet, Juan Store, etc.";
    descriptionSnippet = "Agrega el nombre de tu emprendimiento con el que te reconocen en redes sociales y una descripción de lo que creas y ofrecerás en los eventos.";
  }

  if (props.profile.category === "gastronomy") {
    title = "¿Cuál es el nombre de tu negocio?";
    namePlaceholder = "Ej. Delicias Dulces, Ale Café, etc.";
    descriptionSnippet = "Agrega el nombre de tu negocio gastronómico y una descripción de lo que ofrecerás en los eventos.";
  }

  return (
    <>
      <StepDescription
        title={title}
        description={descriptionSnippet}
      />
      <DisplayNameForm
        profile={props.profile}
        onSubmit={() => {}}
        displayNamePlaceholder={namePlaceholder}
      />
    </>
  );
}
