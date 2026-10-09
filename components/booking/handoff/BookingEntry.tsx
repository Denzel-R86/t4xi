"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import BookingSection from "@/components/booking/BookingSection";
import { handoffSnapshot, shownPriceFor, type HandoffRide, type ShownPrice } from "@/lib/booking-handoff";

type SectionProps = NonNullable<ComponentProps<typeof BookingSection>>;

const noSubscribe = () => () => {};
const serverSnapshot = () => null;

/** Handoff → beginwaarden van het formulier; de prijs komt nooit uit storage. */
export function handoffSectionProps(ride: HandoffRide, shown: ShownPrice | null): SectionProps {
  return {
    initialPickup: ride.pickup,
    initialDropoff: ride.dropoff,
    initialPersons: ride.persons,
    initialDate: ride.date,
    initialTime: ride.time,
    initialLuggage: ride.luggage,
    handoff: { shown },
  };
}

/**
 * /boeken-ingang (PR 2.3, §7). Met `?h=1` leest dit de handoff uit sessionStorage
 * (na hydratatie: de server kent geen storage). Geldig → formulier met de rit uit de
 * hero en, als dezelfde JS-context de server-prijs voor die quoteId nog kent, die
 * prijs direct (de hook rekent verifiërend). Ongeldig/verlopen/afwezig → de gewone
 * query-ingang, dus publieke deep-links (`?pickup=Almere Poort&dropoff=Schiphol`)
 * blijven ongewijzigd werken.
 */
export default function BookingEntry({ fromHandoff, ...queryProps }: Omit<SectionProps, "handoff"> & { fromHandoff: boolean }) {
  const ride = useSyncExternalStore(noSubscribe, fromHandoff ? handoffSnapshot : serverSnapshot, serverSnapshot);
  if (!ride) return <BookingSection key="query" {...queryProps} />;
  return <BookingSection key="handoff" {...handoffSectionProps(ride, shownPriceFor(ride.quoteId))} />;
}
