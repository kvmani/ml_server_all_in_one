import { ReactNode } from "react";

export type ToolShellProps = {
  intro: ReactNode;
  workspace: ReactNode;
  className?: string;
};

export function ToolShell({ intro, workspace, className }: ToolShellProps) {
  const classes = ["tool-shell__layout"];
  if (className) {
    classes.push(className);
  }
  return (
    <div className={classes.join(" ")}>
      <aside className="tool-shell__intro">{intro}</aside>
      {workspace}
    </div>
  );
}

export type ToolShellIntroProps = {
  icon: string;
  iconAlt?: string;
  category?: string;
  title: string;
  titleId?: string;
  summary?: ReactNode;
  bullets?: Array<ReactNode>;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
};

export function ToolShellIntro({
  icon,
  iconAlt = "",
  category,
  title,
  titleId,
  summary,
  bullets,
  actions,
  footer,
  children,
}: ToolShellIntroProps) {
  const renderSummary = () => {
    if (!summary) {
      return null;
    }
    return typeof summary === "string" ? <p>{summary}</p> : summary;
  };

  return (
    <>
      <div className="tool-shell__icon" aria-hidden={iconAlt === ""}>
        <img src={icon} alt={iconAlt} />
      </div>
      {category ? <p className="tool-card__category">{category}</p> : null}
      <h1 id={titleId} className="section-heading">
        {title}
      </h1>
      {renderSummary()}
      {children}
      {bullets?.length ? (
        <ul>
          {bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {actions ? <div className="tool-shell__actions">{actions}</div> : null}
      {footer}
    </>
  );
}
