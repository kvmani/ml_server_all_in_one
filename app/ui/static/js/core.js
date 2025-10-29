export function bindForm(form, { onSubmit }) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelectorAll("[data-role='status']").forEach((el) => {
      el.textContent = "Processing…";
    });
    try {
      await onSubmit(new FormData(form));
      form.querySelectorAll("[data-role='status']").forEach((el) => {
        el.textContent = "Done";
      });
    } catch (error) {
      form.querySelectorAll("[data-role='status']").forEach((el) => {
        el.textContent = error.message;
      });
    }
  });
}


export function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
