import { Ok, Error } from "../../gleam.mjs";

export function pick_base64(accept) {
  return new Promise((resolve) => {
    const document = globalThis.document;
    if (!document || typeof document.createElement !== "function") {
      resolve(new Error("File picker unavailable."));
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = String(accept);
    input.style.display = "none";

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
      if (input.parentNode) input.parentNode.removeChild(input);
      input.value = "";
      resolve(result);
    };

    const onChange = () => {
      const file = input.files && input.files[0];
      if (!file) {
        finish(new Error("No file selected."));
        return;
      }
      const reader = new globalThis.FileReader();
      reader.onload = () => {
        const payload = String(reader.result || "");
        const comma = payload.indexOf(",");
        finish(new Ok(comma >= 0 ? payload.slice(comma + 1) : payload));
      };
      reader.onerror = () => {
        finish(new Error("Could not read the selected file."));
      };
      reader.readAsDataURL(file);
    };

    const onCancel = () => {
      finish(new Error("File selection cancelled."));
    };

    input.addEventListener("change", onChange);
    input.addEventListener("cancel", onCancel);
    (document.body || document.documentElement).appendChild(input);
    input.click();
  });
}
