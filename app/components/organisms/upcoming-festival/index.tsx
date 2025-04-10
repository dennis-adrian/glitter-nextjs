"use client";

import { Calendar, MapPin } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Festival } from "@/app/data/festivals/definitions";
import { formatFullDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import { ProfileType } from "@/app/api/users/definitions";
import { ReservationWithParticipantsAndUsersAndStandAndCollaborators } from "@/app/api/reservations/definitions";
import InfoTabContent from "@/app/components/organisms/upcoming-festival/info-tab-content";
import TeamTabContent from "@/app/components/organisms/upcoming-festival/team-tab-content";

type UpcomingFestivalCardProps = {
  festival: Festival;
  profile: ProfileType;
  reservation?: ReservationWithParticipantsAndUsersAndStandAndCollaborators;
};
export function UpcomingFestivalCard({
  festival,
  profile,
  reservation,
}: UpcomingFestivalCardProps) {
  const festivalStartDate = formatFullDate(
    festival?.festivalDates[0]?.startDate,
    DateTime.DATE_MED,
  );
  const festivalEndDate = formatFullDate(
    festival?.festivalDates[1]?.startDate,
    DateTime.DATE_MED,
  );

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
          <InfoTabContent
            festival={festival}
            reservation={reservation}
            festivalStartDate={festivalStartDate}
            festivalEndDate={festivalEndDate}
          />
        </TabsContent>

        <TabsContent value="activities" className="p-4">
          {/* <ScrollArea className="h-[300px] pr-4">
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
          </ScrollArea> */}
          <div>Contenido en construcción</div>
        </TabsContent>

        <TabsContent value="team" className="p-4">
          {reservation ? (
            <TeamTabContent reservation={reservation} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-sm text-gray-500">
                No hay colaboradores para esta reserva.
              </p>
            </div>
          )}
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
