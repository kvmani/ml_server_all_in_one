export default function ErrorPage({ props }: { props: Record<string, unknown> }) {
  const status = (props?.status as number) ?? 500;
  const title = (props?.title as string) ?? "Something went wrong";
  const message = (props?.message as string) ?? "An unexpected error occurred.";

  return (
    <section className="shell surface-block" aria-labelledby="error-title">
      <h1 id="error-title" className="section-heading">
        {status}: {title}
      </h1>
      <p>{message}</p>
      <p>
        <a className="btn" href="/">
          Return home
        </a>
      </p>
    </section>
  );
}
