import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional classes, resolving Tailwind conflicts in favour of later inputs. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
