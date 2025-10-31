import { Link } from "react-router-dom";

type ErrorPageProps = {
  status?: number;
  title?: string;
  message?: string;
};

export default function ErrorPage({
  status = 500,
  title = "Something went wrong",
  message = "An unexpected error occurred.",
}: ErrorPageProps) {
  return (
    <section className="shell surface-block" aria-labelledby="error-title">
      <h1 id="error-title" className="section-heading">
        {status}: {title}
      </h1>
      <p>{message}</p>
      <p>
        <Link className="btn" data-keep-theme to="/">
          Return home
        </Link>
      </p>
    </section>
  );
}
