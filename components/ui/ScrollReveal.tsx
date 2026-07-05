"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll reveal — vervangt initScrollReveal() uit de statische site.
 *
 * De v14 Safari-bug ontstond door een race condition: JS die vóór de
 * DOM-ready state elementen probeerde te observeren. Hier is dat
 * structureel opgelost:
 * - useEffect draait per definitie ná mount (geen race mogelijk)
 * - content is standaard zichtbaar zonder JS (progressive enhancement)
 * - prefers-reduced-motion wordt in CSS afgehandeld
 */
export default function ScrollReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
