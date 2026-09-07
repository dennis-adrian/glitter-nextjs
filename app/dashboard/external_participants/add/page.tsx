import ExternalParticipantForm from "@/app/components/organisms/external_participants/external-participant-form";

export default function AddExternalParticipantPage() {
  return (
    <div className="container p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-bold">Agregar participante externo</h1>
      <ExternalParticipantForm />
    </div>
  );
}
