import { DragEvent, HTMLAttributes, ReactNode } from "react";

export type DropzoneProps = {
  id?: string;
  className?: string;
  hasFile?: boolean;
  onDropFiles?: (files: FileList) => void;
  preview?: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "onDrop" | "onDragOver">;

export function Dropzone({
  id,
  className,
  hasFile = false,
  onDropFiles,
  preview,
  copy,
  actions,
  children,
  ...rest
}: DropzoneProps) {
  const classes = ["dropzone"];
  if (hasFile) {
    classes.push("has-file");
  }
  if (className) {
    classes.push(className);
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (onDropFiles && event.dataTransfer?.files?.length) {
      onDropFiles(event.dataTransfer.files);
    }
  };

  return (
    <div
      id={id}
      className={classes.join(" ")}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      {...rest}
    >
      {preview ? <div className="dropzone__preview" aria-hidden="true">{preview}</div> : null}
      {copy ? <div className="dropzone__copy">{copy}</div> : null}
      {actions ? <div className="dropzone__actions">{actions}</div> : null}
      {children}
    </div>
  );
}
