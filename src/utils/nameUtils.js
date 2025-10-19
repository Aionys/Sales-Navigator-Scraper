import { transliterate } from "transliteration";
import emojiStrip from "emoji-strip";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitleCase(text) {
  if (!text) return "";

  return text
    .split(/\s+/)
    .map((token) => {
      if (!token) return "";

      const leadMatch = token.match(/^[^A-Za-z0-9]+/);
      const trailMatch = token.match(/[^A-Za-z0-9]+$/);

      const leading = leadMatch ? leadMatch[0] : "";
      const trailing = trailMatch ? trailMatch[0] : "";

      const core = token.slice(leading.length, token.length - trailing.length);

      let processed = core;

      if (!core) {
        processed = core;
      } else if (/^[A-Za-z.]+$/.test(core) && core.includes(".")) {
        const parts = core.split(".");
        processed = parts
          .map((p) => {
            if (p === "") return "";
            return p.length === 1
              ? p.toUpperCase()
              : p[0].toUpperCase() + p.slice(1).toLowerCase();
          })
          .join(".");
      } else {
        processed = core
          .split(/([-'\u2019])/)
          .map((seg) => {
            if (seg === "-" || seg === "'" || seg === "’") return seg;
            if (!seg) return seg;
            return seg[0].toUpperCase() + seg.slice(1).toLowerCase();
          })
          .join("");
      }

      return leading + processed + trailing;
    })
    .join(" ");
}

function parseFirstName(firstNameRaw) {
  let s = transliterate(String(firstNameRaw || ""));
  s = emojiStrip(s);
  s = s.replace(/\s+/g, " ").trim();

  s = s.replace(/(['’]s)$/i, "");
  s = s.replace(/(['’])$/i, "");

  return toTitleCase(s);
}

function parseLastName(firstNameRaw, fullNameRaw) {
  let s = String(fullNameRaw || "");

  if (firstNameRaw) {
    let f = String(firstNameRaw).trim();
    f = f.replace(/(['’]s)$/i, "");
    f = f.replace(/(['’])$/i, "");

    const pattern = "^\\s*" + escapeRegex(f) + "['’]?(?:s)?\\s*";
    const re = new RegExp(pattern, "i");
    s = s.replace(re, "");
  }

  s = emojiStrip(s);
  s = s.split(",")[0].trim();
  s = transliterate(s);
  s = s.replace(/\s+/g, " ").trim();

  return toTitleCase(s);
}

export function cleanName(firstNameRaw, fullNameRaw) {
  const first = parseFirstName(firstNameRaw) || "First name not found";
  const last = parseLastName(firstNameRaw, fullNameRaw) || "Last name not found";
  return { firstName: first, lastName: last };
}
