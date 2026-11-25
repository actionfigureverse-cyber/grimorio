#!/usr/bin/env python3
"""Crea app/src/main/assets/catalog.js con i film di pubblico dominio di Internet Archive,
arricchiti (titolo italiano, generi, cast, regia) con i dati di Wikidata."""
import json, re, sys, time, pathlib
import requests

OUT = pathlib.Path(__file__).resolve().parent.parent / "app/src/main/assets/catalog.js"
UA = {"User-Agent": "GrimorioTV/1.0 (catalogo personale; https://github.com)"}
S = requests.Session(); S.headers.update(UA)

# collezioni curate di pubblico dominio su Internet Archive
COLLECTIONS = {
    "feature_films": 2500, "SciFi_Horror": 600, "classic_cartoons": 500, "silent_films": 600,
    "Comedy_Films": 400, "Film_Noir": 300, "cartoonsandanimation": 0,
}
EXTRA_QUERIES = [  # ricerche mirate per il fantasy, sempre dentro collezioni di pubblico dominio
    '(subject:fantasy OR subject:"sword and sorcery" OR subject:mythology OR subject:peplum OR subject:"sword and sandal" OR subject:"fairy tale") AND collection:(feature_films OR silent_films OR SciFi_Horror OR classic_cartoons)',
    'language:(Italian OR ita OR italiano) AND collection:(feature_films OR silent_films OR SciFi_Horror OR Comedy_Films OR Film_Noir)',
]

def get(url, **kw):
    for i in range(4):
        try:
            r = S.get(url, timeout=90, **kw)
            if r.status_code == 200:
                return r
        except requests.RequestException as e:
            print("retry", e, file=sys.stderr)
        time.sleep(3 * (i + 1))
    return None

def archive(q, rows):
    r = get("https://archive.org/advancedsearch.php", params={
        "q": f"({q}) AND mediatype:movies",
        "fl[]": ["identifier", "title", "year", "subject", "creator", "description", "language", "downloads"],
        "sort[]": "downloads desc", "rows": rows, "page": 1, "output": "json"})
    return (r.json().get("response", {}).get("docs", []) if r else [])

def as_list(v):
    if v is None: return []
    return v if isinstance(v, list) else [v]

def clean(s, n=320):
    s = re.sub(r"<[^>]+>", " ", " ".join(as_list(s)) if isinstance(s, list) else str(s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    return (s[:n].rsplit(" ", 1)[0] + "…") if len(s) > n else s

# parole chiave (inglese e italiano) -> genere in italiano
GEN = [
    ("Fantasy", r"fantasy|fantastic|fantastico|sword and sorcery|sword & sorcery|magic|magia|wizard|witch|fairy|fiaba|mytholog|mitolog|legend|leggenda|dragon|drago|peplum|sword and sandal"),
    ("Avventura", r"adventure|avventur|swashbuckl|pirat|cappa e spada"),
    ("Animazione", r"animat|cartoon|animazione|cartone"),
    ("Horror", r"horror|orrore|vampir|monster|mostr|zombie|gothic|gotico"),
    ("Fantascienza", r"sci-?fi|science fiction|fantascienza|space|alien"),
    ("Commedia", r"comed|commedia|comic|slapstick"),
    ("Azione", r"action|azione|martial"),
    ("Western", r"western"),
    ("Giallo e noir", r"noir|crime|mystery|thriller|giallo|poliziesc|detective|gangster"),
    ("Dramma", r"drama|dramm|melodram"),
    ("Guerra", r"\bwar\b|guerra|military"),
    ("Storia", r"histor|stori|biograph|biografic|epic|kolossal"),
    ("Famiglia", r"family|famiglia|children|bambini"),
    ("Musical", r"musical|music"),
    ("Muto", r"silent|muto"),
]
FANTASY_RE = re.compile(r"fantasy|fantastic|sword and sorcery|sorcer|stregon|magic|magia|wizard|witch|strega|fairy|fiaba|mytholog|mitolog|dragon|drago|hercules|ercole|maciste|ulysses|ulisse|odyss|sinbad|bagdad|baghdad|arabian nights|mille e una notte|nibelung|siegfried|sigfrido|king arthur|excalibur|camelot|merlin|giant|gigant|cyclop|ciclop|minotaur|medusa|argonaut|titan|elf|gnome|troll|genie|aladdin|peplum|sword and sandal|barbarian|barbar|viking|vichingh|conan|enchant|incant|legend of|leggenda", re.I)

def main():
    items = {}
    def add(d, coll=None):
        i = d.get("identifier")
        if not i or i in items: return
        items[i] = d
    for c, n in COLLECTIONS.items():
        if n:
            docs = archive(f"collection:{c}", n); print(c, len(docs)); [add(d) for d in docs]
    for q in EXTRA_QUERIES:
        docs = archive(q, 1500); print("extra", len(docs)); [add(d) for d in docs]
    print("totale archive:", len(items))

    # --- arricchimento Wikidata (P724 = Internet Archive ID) ---
    wd = {}
    ids = list(items)
    for k in range(0, len(ids), 200):
        chunk = ids[k:k + 200]
        values = " ".join(json.dumps(x) for x in chunk)
        q = f"""SELECT ?ia ?it ?en ?desc (GROUP_CONCAT(DISTINCT ?gl;separator="|") AS ?g)
          (GROUP_CONCAT(DISTINCT ?al;separator="|") AS ?c) (GROUP_CONCAT(DISTINCT ?dl;separator="|") AS ?r)
          (GROUP_CONCAT(DISTINCT ?lang;separator="|") AS ?l) WHERE {{
          VALUES ?ia {{ {values} }} ?item wdt:P724 ?ia.
          OPTIONAL {{ ?item rdfs:label ?it FILTER(LANG(?it)="it") }}
          OPTIONAL {{ ?item rdfs:label ?en FILTER(LANG(?en)="en") }}
          OPTIONAL {{ ?item schema:description ?desc FILTER(LANG(?desc)="it") }}
          OPTIONAL {{ ?item wdt:P136 ?gg. ?gg rdfs:label ?gl FILTER(LANG(?gl)="it") }}
          OPTIONAL {{ ?item wdt:P161 ?a. ?a rdfs:label ?al FILTER(LANG(?al) IN ("it","en","mul")) }}
          OPTIONAL {{ ?item wdt:P57 ?dd. ?dd rdfs:label ?dl FILTER(LANG(?dl) IN ("it","en","mul")) }}
          OPTIONAL {{ ?item wdt:P364 ?lg. BIND(STR(?lg) AS ?lang) }}
        }} GROUP BY ?ia ?it ?en ?desc"""
        for attempt in range(3):
            try:
                r = S.post("https://query.wikidata.org/sparql", data={"query": q}, headers={"Accept": "application/sparql-results+json"}, timeout=120)
                if r.status_code == 200:
                    for b in r.json()["results"]["bindings"]:
                        v = lambda n: b.get(n, {}).get("value", "")
                        ia = v("ia"); cur = wd.setdefault(ia, {})
                        if v("it"): cur["t"] = v("it")
                        if v("desc"): cur["d"] = v("desc")
                        cur["g"] = sorted(set(cur.get("g", []) + [x for x in v("g").split("|") if x]))
                        cur["c"] = list(dict.fromkeys(cur.get("c", []) + [x for x in v("c").split("|") if x]))
                        cur["r"] = v("r").split("|")[0] if v("r") else cur.get("r", "")
                        cur["l"] = cur.get("l") or "Q652" in v("l")
                    break
                time.sleep(5)
            except Exception as e:
                print("wikidata errore", e, file=sys.stderr); time.sleep(5)
        time.sleep(1)
    print("arricchiti da wikidata:", len(wd))

    out = []
    for i, d in items.items():
        w = wd.get(i, {})
        title = clean(d.get("title"), 120)
        if not title: continue
        subj = " ".join(as_list(d.get("subject")))
        desc = clean(d.get("description"))
        text = " ".join([title, subj, desc, " ".join(w.get("g", []))]).lower()
        genres = [g for g, rx in GEN if re.search(rx, " ".join([subj, " ".join(w.get("g", []))]).lower())]
        y = str(d.get("year") or "")[:4]
        if y.isdigit() and int(y) < 1929 and "Muto" not in genres and re.search(r"silent|muto", text): genres.append("Muto")
        lang = " ".join(as_list(d.get("language"))).lower()
        rec = {"i": i, "t": w.get("t") or title, "y": int(y) if y.isdigit() else None,
               "g": genres, "c": w.get("c", [])[:12], "r": w.get("r") or "",
               "d": w.get("d", "").capitalize() + (" — " if w.get("d") and desc else "") + desc if (w.get("d") or desc) else "",
               "p": int(d.get("downloads") or 0),
               "l": 1 if (w.get("l") or re.search(r"\bit(a|alian|aliano)?\b", lang)) else 0,
               "f": 1 if (FANTASY_RE.search(text) or "Fantasy" in genres) else 0}
        if rec["t"] != title: rec["o"] = title
        if rec["f"] and "Fantasy" not in rec["g"]: rec["g"].insert(0, "Fantasy")
        rec = {k: v for k, v in rec.items() if v not in (None, "", [], 0) or k in ("i", "t")}
        rec["d"] = clean(rec.get("d", ""), 360)
        out.append(rec)
    out.sort(key=lambda x: -x.get("p", 0))
    if len(out) < 50:
        sys.exit("Catalogo troppo piccolo: Internet Archive non ha risposto.")
    OUT.write_text("window.CATALOG=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"scritti {len(out)} titoli ({sum(1 for x in out if x.get('f'))} fantasy, {sum(1 for x in out if x.get('l'))} in italiano) -> {OUT}")

if __name__ == "__main__":
    main()
