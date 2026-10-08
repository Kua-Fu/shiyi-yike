import { authorSearchText } from "./author-library.js";

const input = document.querySelector("#author-directory-query");
const entries = [...document.querySelectorAll("#author-directory-list > li")];
const status = document.querySelector("#author-directory-status");
const empty = document.querySelector("#author-directory-empty");

function normalize(value) {
  return String(value).normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function filterAuthors() {
  const terms = normalize(input.value).trim().split(/\s+/).filter(Boolean);
  let count = 0;
  for (const entry of entries) {
    const searchable = normalize(authorSearchText(entry.dataset));
    const matches = terms.every((term) => searchable.includes(term));
    entry.hidden = !matches;
    if (matches) count += 1;
  }
  status.textContent = terms.length ? `找到 ${count} 位诗人` : `共 ${count} 位诗人`;
  empty.hidden = count !== 0;
}

input.addEventListener("input", filterAuthors);
