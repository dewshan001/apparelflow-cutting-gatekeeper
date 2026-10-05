import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reads the REAL colours out of src/app/globals.css, so editing the stylesheet into a
// low-contrast state fails `npm test`. Ratios follow WCAG 2.x (AA: 4.5:1 text, 3:1 UI parts).

const SRC = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const css = fs
  .readFileSync(path.join(decodeURIComponent(SRC), "app/globals.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ");

function declarations(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`CSS rule not found: ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf("}", start));
  return Object.fromEntries(
    body
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
      }),
  );
}

const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected a 6-digit hex colour, got "${hex}"`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const outlineColor = (value) => /#[0-9a-f]{6}/i.exec(value)[0];
const outlineWidth = (value) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(value)[1]);

describe("global form-control colours meet WCAG AA", () => {
  const controls = declarations("input, select, textarea, option");

  it("uses dark text on a white background for inputs, selects, textareas and options", () => {
    expect(controls.color).toBe("#111827");
    expect(controls["background-color"]).toBe("#ffffff");
    expect(ratio(controls.color, controls["background-color"])).toBeGreaterThanOrEqual(7);
  });

  it("keeps placeholder text readable (>= 4.5:1) and fully opaque", () => {
    const placeholder = declarations("input::placeholder, textarea::placeholder");
    expect(placeholder.color).toBe("#6b7280");
    expect(placeholder.opacity).toBe("1");
    expect(ratio(placeholder.color, controls["background-color"])).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps typed text dark on white while focused, with a clearly visible focus ring", () => {
    const focus = declarations("input:focus, select:focus, textarea:focus");
    expect(ratio(focus.color, focus["background-color"])).toBeGreaterThanOrEqual(7);
    expect(outlineWidth(focus.outline)).toBeGreaterThanOrEqual(2);
    expect(ratio(outlineColor(focus.outline), controls["background-color"])).toBeGreaterThanOrEqual(3);
  });

  it("keeps disabled inputs and their placeholders legible", () => {
    const disabled = declarations("input:disabled, select:disabled, textarea:disabled");
    expect(ratio(disabled.color, disabled["background-color"])).toBeGreaterThanOrEqual(4.5);
    const placeholder = declarations("input:disabled::placeholder, textarea:disabled::placeholder");
    expect(ratio(placeholder.color, disabled["background-color"])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("buttons, links and dialogs", () => {
  it("keeps disabled and busy buttons legible without faded (opacity) text", () => {
    const disabled = declarations("button:disabled");
    expect(ratio(disabled.color, disabled["background-color"])).toBeGreaterThanOrEqual(4.5);
    expect(disabled.opacity).toBe("1");
  });

  it("shows a visible keyboard focus ring on buttons and links", () => {
    const focus = declarations("button:focus-visible, a:focus-visible");
    expect(outlineWidth(focus.outline)).toBeGreaterThanOrEqual(2);
    expect(ratio(outlineColor(focus.outline), "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("uses dark text on white inside dialogs", () => {
    const dialog = declarations("dialog");
    expect(ratio(dialog.color, dialog["background-color"])).toBeGreaterThanOrEqual(7);
  });

  it("uses dark body text on a white page", () => {
    const root = declarations(":root");
    expect(ratio(root["--foreground"], root["--background"])).toBeGreaterThanOrEqual(7);
  });
});

describe("no dark-mode / white-on-white regressions", () => {
  it("forces a light colour scheme", () => {
    expect(declarations(":root")["color-scheme"]).toBe("light");
  });

  it("has no dark-mode override that could turn inputs white-on-white", () => {
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("no component fades text with opacity or uses very light grey text classes", () => {
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
      }
    };
    walk(decodeURIComponent(SRC));
    const banned = [/\bdisabled:opacity-/, /\btext-opacity-/, /\btext-gray-(?:50|100|200|300|400)\b/, /\bplaceholder-/, /\bopacity-(?:[0-9]|[1-9][0-9])\b/];
    const hits = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const re of banned) if (re.test(text)) hits.push(`${path.relative(decodeURIComponent(SRC), file)}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
});
