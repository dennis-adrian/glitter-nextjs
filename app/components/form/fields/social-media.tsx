"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import {
  faInstagram,
  faTiktok,
  IconDefinition,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { InputHTMLAttributes } from "react";
import { UseFormReturn } from "react-hook-form";

export default function SocialMediaInput({
  bottomBorderOnly,
  icon,
  formControl,
  label,
  name,
  ...props
}: {
  bottomBorderOnly?: boolean;
  icon?: IconDefinition;
  formControl: UseFormReturn<any>["control"];
  label: string;
  name: string;
  placeholder?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => {
        return (
          <FormItem className="grid gap-2 w-full">
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <div className="flex items-end gap-2">
                {icon && (
                  <FontAwesomeIcon
                    className="w-5 h-5 mb-2 text-muted-foreground"
                    icon={icon}
                  />
                )}
                <div className="relative flex items-center w-full">
                  <span className="absolute text-muted-foreground">@</span>
                  <Input
                    className="pl-5"
                    bottomBorderOnly={bottomBorderOnly}
                    {...props}
                    {...field}
                  />
                </div>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
