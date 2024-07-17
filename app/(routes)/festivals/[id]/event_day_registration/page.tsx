import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";

export default async function Page() {
  return (
    <div className="container p-4 md:p-6">
      <h1 className="my-4 text-2xl font-bold md:text-3xl">
        Elige el tipo de registro
      </h1>
      <RegistrationTypeCards />
    </div>
  );
}
