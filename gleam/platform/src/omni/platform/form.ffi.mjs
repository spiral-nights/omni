import { toList } from "../../gleam.mjs";

/**
 * Scans the enclosing form/card/panel/box container of target for named inputs/toggles
 * to capture ambient form values. Safe in headless / SSR environments.
 */
export function collect_ambient_form_values(eventOrTarget) {
  if (typeof document === "undefined" || !eventOrTarget) {
    return toList([]);
  }
  const el = eventOrTarget.target || eventOrTarget;
  let container = null;
  if (el && typeof el.closest === "function") {
    container =
      el.closest("form") ||
      el.closest(
        ".omni-card, .omni-panel, [data-viewport-host], [data-plugin-viewport], [data-schema-root]"
      ) ||
      el.closest(".omni-box") ||
      (document.body || document.documentElement);
  } else if (typeof document.querySelector === "function") {
    container = document.body || document.documentElement;
  }
  if (!container || typeof container.querySelectorAll !== "function") {
    return toList([]);
  }

  const results = [];
  const fields = container.querySelectorAll(
    "input[name], textarea[name], select[name]"
  );
  for (const field of fields) {
    const name = field.name || field.getAttribute("name");
    if (!name) continue;
    if (field.type === "checkbox") {
      results.push([name, field.checked]);
    } else if (field.type === "radio") {
      if (field.checked) {
        results.push([name, field.value]);
      }
    } else if (field.type === "file") {
      if (field.files && field.files.length > 0) {
        results.push([name, field.files[0].name]);
      }
    } else {
      results.push([name, field.value]);
    }
  }
  return toList(results);
}

/**
 * Triggers asynchronous FileReader.readAsArrayBuffer on the selected file of a file input
 * and dispatches a CustomEvent "omni-file-loaded" with the ArrayBuffer bytes and metadata.
 */
export function handle_file_input_change(event) {
  if (!event || !event.target) return null;
  const files = event.target.files;
  if (!files || files.length === 0) return null;
  const file = files[0];
  const target = event.target;
  if (typeof FileReader !== "undefined") {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      if (target && typeof target.dispatchEvent === "function") {
        target.dispatchEvent(
          new CustomEvent("omni-file-loaded", {
            bubbles: true,
            detail: {
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type,
              fileBytes: bytes,
              value: file.name,
            },
          })
        );
      }
    };
    reader.readAsArrayBuffer(file);
  }
  return [file.name, file.size, file.type];
}

/**
 * Triggers asynchronous FileReader.readAsArrayBuffer on a dropped file
 * and dispatches a CustomEvent "omni-file-loaded" with the ArrayBuffer bytes and metadata.
 */
export function handle_file_drop(event) {
  if (!event || !event.dataTransfer) return null;
  const files = event.dataTransfer.files;
  if (!files || files.length === 0) return null;
  const file = files[0];
  const target = event.currentTarget || event.target;
  if (typeof FileReader !== "undefined") {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      if (target && typeof target.dispatchEvent === "function") {
        target.dispatchEvent(
          new CustomEvent("omni-file-loaded", {
            bubbles: true,
            detail: {
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type,
              fileBytes: bytes,
              value: file.name,
            },
          })
        );
      }
    };
    reader.readAsArrayBuffer(file);
  }
  return [file.name, file.size, file.type];
}

/**
 * Calculates SVG pie wedge arc path string for ProgressDisk countdown dials.
 */
export function pie_wedge_path(ratio, cx, cy, r) {
  if (ratio <= 0.001) return "";
  if (ratio >= 0.999) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const angle = ratio * 2 * Math.PI;
  const startX = cx;
  const startY = cy - r;
  const endX = (cx + r * Math.sin(angle)).toFixed(2);
  const endY = (cy - r * Math.cos(angle)).toFixed(2);
  const largeArc = ratio > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}
