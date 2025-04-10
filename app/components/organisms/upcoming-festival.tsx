"use client";

import { useState } from "react";
import { Calendar, Palette, MapPin, Star, Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar-radix";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Festival } from "@/app/data/festivals/definitions";
import { formatFullDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import Image from "next/image";
import { ProfileType } from "@/app/api/users/definitions";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";

type UpcomingFestivalCardProps = {
  festival: Festival;
  profile: ProfileType;
  reservation?: ReservationWithParticipantsAndUsersAndStand;
};
export function UpcomingFestivalCard({
  festival,
  profile,
  reservation,
}: UpcomingFestivalCardProps) {
  const [teamMembers, setTeamMembers] = useState([
    {
      id: 1,
      name: "Alex Rivera",
      role: "Assistant",
      email: "alex@example.com",
      avatar: "/placeholder.svg?height=40&width=40",
    },
  ]);
  const [newMember, setNewMember] = useState({ name: "", role: "", email: "" });

  const participation = profile.participations.find(
    (participation) => participation.reservation.festivalId === festival.id,
  );

  const festivalStartDate = formatFullDate(
    festival?.festivalDates[0]?.startDate,
    DateTime.DATE_MED,
  );
  const festivalEndDate = formatFullDate(
    festival?.festivalDates[1]?.startDate,
    DateTime.DATE_MED,
  );

  const handleAddMember = () => {
    if (newMember.name && newMember.role && newMember.email) {
      setTeamMembers([
        ...teamMembers,
        {
          id: Date.now(),
          ...newMember,
          avatar: "/placeholder.svg?height=40&width=40",
        },
      ]);
      setNewMember({ name: "", role: "", email: "" });
      toast.success("Team member added", {
        description: `${newMember.name} has been added to your stand team.`,
      });
    }
  };

  const handleRemoveMember = (id: number) => {
    setTeamMembers(teamMembers.filter((member) => member.id !== id));
    toast.success("Team member removed", {
      description: "The team member has been removed from your stand team.",
    });
  };

  const handleSignUp = (activity: string) => {
    toast.success("Signed up successfully", {
      description: `You've been registered for ${activity}.`,
    });
  };

  return (
    <Card className="w-full max-w-4xl shadow-lg border-rose-100 mx-auto">
      <CardHeader className="bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-t-lg">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-2xl md:text-3xl font-bold">
              {festival.name}
            </CardTitle>
            <CardDescription className="text-rose-100 mt-2 text-base">
              {festival.description}
            </CardDescription>
          </div>
          <Badge className="hidden md:block bg-white text-rose-500 hover:bg-rose-100 px-3 py-1 text-sm">
            Participante Confirmado
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-rose-200" />
            <span>
              {festivalStartDate} - {festivalEndDate}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-rose-200" />
            <span>{festival.locationLabel}</span>
          </div>
          {/* <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-rose-200" />
            <span>10 days remaining</span>
          </div> */}
        </div>
      </CardHeader>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="activities">Actividades</TabsTrigger>
          <TabsTrigger value="team">Colaboradores</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="p-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              {festival.festivalBannerUrl ? (
                <div className="relative w-28 h-32">
                  <Image
                    className="object-cover"
                    src={festival.festivalBannerUrl}
                    alt={festival.name}
                    fill
                    unoptimized
                  />
                </div>
              ) : (
                <div className="bg-rose-100 p-3 rounded-full">
                  <Palette className="h-6 w-6 text-rose-500" />
                </div>
              )}
              {reservation && (
                <div>
                  <h3 className="font-semibold text-lg">
                    Espacio #{reservation.stand.label}
                    {reservation.stand.standNumber}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {reservation.participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="text-sm flex items-center gap-1"
                      >
                        <Avatar className="relative h-10 w-10">
                          <AvatarImage
                            className="object-cover"
                            alt="avatar image"
                            src={participant.user.imageUrl || ""}
                          />
                          <AvatarFallback>
                            {participant.user.displayName
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("") || "N"}
                          </AvatarFallback>
                        </Avatar>
                        <span>{participant.user.displayName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="text-lg font-semibold mb-2">Horarios</h3>
              <ul className="space-y-2">
                <ul className="text-sm">
                  <span className="font-semibold">
                    Día 1 - {festivalStartDate}
                  </span>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">
                      Ingreso de participantes - armado
                    </span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(festival.festivalDates[0].startDate)
                        .minus({ hours: 2 })
                        .toLocaleString(DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">Ingreso del público</span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(
                        festival.festivalDates[0].startDate,
                      ).toLocaleString(DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">
                      Cierre de puertas al público
                    </span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(
                        festival.festivalDates[0].endDate,
                      ).toLocaleString(DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">Cierre del recinto</span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(festival.festivalDates[0].endDate)
                        .plus({ minutes: 30 })
                        .toLocaleString(DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                </ul>
                <ul className="text-sm">
                  <span className="font-semibold">
                    Día 2 - {festivalEndDate}
                  </span>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">
                      Ingreso de participantes - armado
                    </span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(festival.festivalDates[0].startDate)
                        .minus({ hours: 1 })
                        .toLocaleString(DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">Ingreso del público</span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(
                        festival.festivalDates[0].startDate,
                      ).toLocaleString(DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">
                      Cierre de puertas al público
                    </span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(
                        festival.festivalDates[0].endDate,
                      ).toLocaleString(DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">Desarmado</span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(
                        festival.festivalDates[0].endDate,
                      ).toLocaleString(DateTime.TIME_SIMPLE)}{" "}
                      -{" "}
                      {DateTime.fromJSDate(festival.festivalDates[0].endDate)
                        .plus({ minutes: 45 })
                        .toLocaleString(DateTime.TIME_SIMPLE)}
                    </span>
                  </li>
                  <li className="flex justify-between items-center ml-2">
                    <span className="text-sm">Cierre del recinto</span>
                    <span className="text-sm font-medium">
                      {DateTime.fromJSDate(festival.festivalDates[0].endDate)
                        .plus({ minutes: 45 })
                        .toLocaleString(DateTime.TIME_SIMPLE)}{" "}
                    </span>
                  </li>
                </ul>
              </ul>
            </div>
            {/* 
            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Your Materials</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="badge" checked />
                  <Label htmlFor="badge" className="text-sm">
                    Participant Badge
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="catalog" checked />
                  <Label htmlFor="catalog" className="text-sm">
                    Festival Catalog
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="signage" checked />
                  <Label htmlFor="signage" className="text-sm">
                    Stand Signage
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="wifi" checked />
                  <Label htmlFor="wifi" className="text-sm">
                    WiFi Access
                  </Label>
                </div>
              </div>
            </div> */}
          </div>
        </TabsContent>

        <TabsContent value="activities" className="p-4">
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              <h3 className="font-semibold">Exclusive Activities</h3>
              <p className="text-sm text-gray-500 mb-4">
                Sign up for special events available to exhibitors only.
              </p>

              <div className="space-y-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">
                          Industry Networking Breakfast
                        </h4>
                        <p className="text-sm text-gray-500">
                          April 16, 8AM-10AM • Main Hall
                        </p>
                        <p className="text-sm mt-2">
                          Connect with publishers and art directors over
                          breakfast.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-500 text-rose-500 hover:bg-rose-50"
                        onClick={() =>
                          handleSignUp("Industry Networking Breakfast")
                        }
                      >
                        Sign Up
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">
                          Master Class: Digital Illustration
                        </h4>
                        <p className="text-sm text-gray-500">
                          April 17, 2PM-4PM • Workshop Room B
                        </p>
                        <p className="text-sm mt-2">
                          Advanced techniques with award-winning illustrator
                          Maria Chen.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-500 text-rose-500 hover:bg-rose-50"
                        onClick={() =>
                          handleSignUp("Master Class: Digital Illustration")
                        }
                      >
                        Sign Up
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">VIP Gallery Tour</h4>
                        <p className="text-sm text-gray-500">
                          April 17, 6PM-8PM • Exhibition Hall
                        </p>
                        <p className="text-sm mt-2">
                          Private tour of the curated gallery with the festival
                          director.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-500 text-rose-500 hover:bg-rose-50"
                        onClick={() => handleSignUp("VIP Gallery Tour")}
                      >
                        Sign Up
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">Live Drawing Battle</h4>
                        <p className="text-sm text-gray-500">
                          April 18, 3PM-5PM • Center Stage
                        </p>
                        <p className="text-sm mt-2">
                          Compete with other illustrators in a timed drawing
                          competition.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-500 text-rose-500 hover:bg-rose-50"
                        onClick={() => handleSignUp("Live Drawing Battle")}
                      >
                        Sign Up
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="team" className="p-4">
          <div className="space-y-4">
            <h3 className="font-semibold">Manage Your Stand Team</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add people who will be working with you at your stand.
            </p>

            <div className="grid gap-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Full name"
                    value={newMember.name}
                    onChange={(e) =>
                      setNewMember({ ...newMember, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    placeholder="e.g. Assistant, Collaborator"
                    value={newMember.role}
                    onChange={(e) =>
                      setNewMember({ ...newMember, role: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={newMember.email}
                    onChange={(e) =>
                      setNewMember({ ...newMember, email: e.target.value })
                    }
                  />
                </div>
              </div>
              <Button
                className="w-full bg-rose-500 hover:bg-rose-600 text-white"
                onClick={handleAddMember}
              >
                <Plus className="h-4 w-4 mr-2" /> Add Team Member
              </Button>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-4">
                Current Team ({teamMembers.length})
              </h3>
              {teamMembers.length > 0 ? (
                <div className="space-y-3">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.avatar} alt={member.name} />
                          <AvatarFallback>
                            {member.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <p className="text-sm text-gray-500">
                            {member.role} • {member.email}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-500 hover:text-rose-500"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 bg-gray-50 rounded-lg">
                  <p className="text-gray-500">No team members added yet.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 p-4 rounded-b-lg">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          <span className="text-sm font-medium">
            Featured Illustrator Status
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Download Schedule
          </Button>
          <Button className="bg-rose-500 hover:bg-rose-600" size="sm">
            Contact Organizers
          </Button>
        </div>
      </CardFooter> */}
    </Card>
  );
}
