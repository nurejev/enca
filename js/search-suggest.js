// Suggestions for local result filters. No directory reads or persisted names.
const SearchSuggest = (() => {
  const bindings = new WeakMap();
  const picks = new WeakSet();
  async function collect(values, query, { limit = 60, stale = () => false, pause = () => new Promise(r => setTimeout(r, 0)) } = {}) {
    const q = String(query || "").trim().toLowerCase(), seen = new Set(), out = [];
    let n = 0;
    for (const raw of values) {
      if (stale()) return null;
      const value = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
      const key = value.toLowerCase();
      // Match before limiting: names late in a large result remain discoverable.
      if (value && key.includes(q) && !seen.has(key)) {
        seen.add(key); out.push(value);
        if (out.length >= limit) break;
      }
      if (++n % 1000 === 0) await pause();
    }
    return stale() ? null : out;
  }
  function bind(input, source, context = () => "") {
    if (!input || input.hasAttribute("list")) return;
    const list = document.createElement("datalist");
    list.id = input.id + "List";
    input.after(list); input.setAttribute("list", list.id);
    input.autocomplete = "off"; input.spellcheck = false;
    if (!input.hasAttribute("aria-label")) input.setAttribute("aria-label", input.placeholder || "Search results");
    let generation = 0, timer;
    const clear = () => { generation++; clearTimeout(timer); list.replaceChildren(); };
    const refresh = async () => {
      const run = ++generation, query = input.value, key = context();
      const stale = () => run !== generation || key !== context() || input.value !== query || !input.isConnected;
      const values = await collect(source(), query, { stale });
      if (!values || stale()) return;
      if (values.length === list.options.length && values.every((v, i) => list.options[i].value === v)) return;
      list.replaceChildren(...values.map(value => { const option = document.createElement("option"); option.value = value; return option; }));
    };
    input.addEventListener("focus", refresh);
    input.addEventListener("input", event => {
      generation++; clearTimeout(timer);
      // A selection must not rewrite/reopen the native suggestion popup.
      if ([...list.options].some(o => o.value === input.value)) { picks.add(event); return; }
      timer = setTimeout(refresh, 100);
    });
    input.addEventListener("blur", clear);
    const binding = { clear, refresh }; bindings.set(input, binding);
    return binding;
  }
  return { collect, bind, picked: event => picks.has(event), clear: input => bindings.get(input)?.clear() };
})();
if (typeof module !== "undefined") module.exports = SearchSuggest;
