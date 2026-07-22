import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-bewuste navigatiehelpers. ALLE interne links en programmatic
 * navigatie gebruiken deze — nooit rechtstreeks next/link of next/navigation —
 * anders verliest een Engelse bezoeker zijn taal bij elke klik.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
