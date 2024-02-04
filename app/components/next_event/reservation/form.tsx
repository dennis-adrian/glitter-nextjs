"use client";

import { Stand } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { Button } from "@/app/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/components/ui/form";
import SearchInput from "@/app/components/ui/search-input/input";
import { getSearchArtistOptions } from "@/app/helpers/next_event";
import { useForm } from "react-hook-form";

export default function ReservationForm({
  stand,
  onSelectArtist,
}: {
  stand: Stand;
  onSelectArtist: (artistId: number) => void;
}) {
  const form = useForm();
  const searchOptions = getSearchArtistOptions(stand.festival);

  return (
    <Form {...form}>
      <form className="grid items-start gap-4">
        <FormField
          control={form.control}
          name="artist"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Busca a tu compañero</FormLabel>
              <FormControl>
                <SearchInput
                  options={searchOptions}
                  placeholder="Ingresa el nombre de tu compañero"
                  onSelect={onSelectArtist}
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">Confirmar reserva</Button>
      </form>
    </Form>
  );
}
