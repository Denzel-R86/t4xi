import { Link } from "@/i18n/navigation";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-site px-6 py-24 text-center">
      <p className="text-eyebrow font-medium uppercase text-accent">404</p>
      <h1 className="mt-3 font-display text-display-lg font-semibold text-ink">
        Deze pagina bestaat niet
      </h1>
      <p className="mx-auto mt-4 max-w-md text-secondary">
        Het adres klopt niet of de pagina is verplaatst.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex rounded-md bg-accent px-7 py-3.5 text-sm font-medium text-white shadow-cta transition-colors hover:bg-accent-hover"
        >
          Naar de homepage
        </Link>
      </div>
    </section>
  );
}
