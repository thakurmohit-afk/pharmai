import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility to merge tailwind classes with conditional logic safely.
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
