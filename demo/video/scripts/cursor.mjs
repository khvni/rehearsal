// Injects a visible macOS-style pointer that follows Playwright's mouse, so recordings show where the visitor goes.
export const cursorScript = () => {
  const install = () => {
    if (document.getElementById("__pw_cursor")) return;
    const c = document.createElement("div");
    c.id = "__pw_cursor";
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3 L5 22 L10 17.5 L13.5 25 L16.5 23.6 L13 16.4 L20 16.4 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-200px,-200px)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.3))" });
    document.documentElement.appendChild(c);
    window.addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 5}px, ${e.clientY - 3}px)`; }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
};
