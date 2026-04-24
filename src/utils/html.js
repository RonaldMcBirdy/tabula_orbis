import sanitizeHtml from "sanitize-html";
import { DESCRIPTION_POLICY } from "../constants.js";

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeSearchQuery(value) {
  return value.trim().toLowerCase();
}

export function sanitizePopupHtml(value) {
  return sanitizeHtml(value ?? "", DESCRIPTION_POLICY);
}

export function highlightHtml(value, searchQuery) {
  const html = sanitizePopupHtml(value);
  const term = searchQuery.trim();

  if (!html || !term || typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const pattern = new RegExp(`(${escapeRegExp(term)})`, "gi");
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  for (const node of textNodes) {
    if (!pattern.test(node.nodeValue)) {
      pattern.lastIndex = 0;
      continue;
    }

    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    for (const part of node.nodeValue.split(pattern)) {
      if (!part) {
        continue;
      }

      if (part.toLowerCase() === term.toLowerCase()) {
        const mark = document.createElement("mark");
        mark.textContent = part;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    }
    node.parentNode.replaceChild(fragment, node);
  }

  return template.innerHTML;
}
