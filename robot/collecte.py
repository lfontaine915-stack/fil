"""Robot de collecte du fil.

Lit sources.yaml et filtres.yaml, récupère les flux RSS (articles + YouTube),
filtre, classe par thème, dédoublonne, trouve une image, puis écrit
docs/data/feed.json (lu par l'appli) et docs/data/etat.json (santé des sources).

Lancement : python robot/collecte.py
"""
import concurrent.futures as cf
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import yaml

from ia import enrichir

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "docs" / "data"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "fr,en;q=0.8",
}

AGE_MAX_ARTICLE = 21  # jours
AGE_MAX_VIDEO = 60
MAX_PAR_SOURCE = 30  # éléments gardés par source dans le fil
MAX_IMAGES_A_CHERCHER = 120  # pages d'articles ouvertes par passage pour trouver l'image
SEUIL_DOUBLON = 0.55  # ressemblance de titres (0 à 1) au-delà de laquelle c'est un doublon

MOTS_VIDES = set("""
le la les un une des du de d l et ou en au aux a pour par sur dans avec sans ce cet cette ces
son sa ses leur leurs plus moins tres est sont etre fait faire comme mais qui que quoi dont
the a an of to in on for and or with by from at as is are be its it this that these how why what
new nouveau nouvelle nouveaux world monde first premier premiere video watch here can will
""".split())


# ---------------------------------------------------------------- outils texte

def normaliser(texte):
    """minuscules, sans accents, espaces simples."""
    texte = unicodedata.normalize("NFKD", texte or "")
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    texte = texte.lower().replace("’", "'")
    return re.sub(r"\s+", " ", texte).strip()


def nettoyer_html(texte):
    texte = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", texte or "", flags=re.S | re.I)
    texte = re.sub(r"<[^>]+>", " ", texte)
    texte = html.unescape(texte)
    texte = re.sub(r"The post .*? appeared first on .*?\.?$", "", texte, flags=re.S)
    texte = re.sub(r"L'article .*? est apparu en premier sur .*?\.?$", "", texte, flags=re.S)
    return re.sub(r"\s+", " ", texte).strip()


def couper(texte, n=260):
    if len(texte) <= n:
        return texte
    return texte[:n].rsplit(" ", 1)[0].rstrip(",;:.") + "…"


def motif(mots):
    mots = sorted({normaliser(m) for m in mots if m}, key=len, reverse=True)
    if not mots:
        return None
    return re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(m) for m in mots) + ")")


def jetons(titre):
    return {m for m in re.findall(r"[a-z0-9]+", normaliser(titre)) if len(m) > 2 and m not in MOTS_VIDES}


def url_canonique(url):
    p = urllib.parse.urlsplit(url.strip())
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query) if not k.lower().startswith(("utm_", "fbclid", "gclid"))]
    return urllib.parse.urlunsplit((p.scheme, p.netloc.lower(), p.path.rstrip("/"), urllib.parse.urlencode(q), ""))


def telecharger(url, limite=None, essais=2):
    derniere = None
    for i in range(essais):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read(limite) if limite else r.read()
        except Exception as e:  # noqa: BLE001
            derniere = e
            time.sleep(1.5 * (i + 1))
    raise derniere


# ---------------------------------------------------------------- images

PUB = re.compile(r"(cap_pub|batiregie|doubleclick|adserver|/ads?/|visu\.php|pixel|feeds\.feedburner|1x1|gravatar|emoji|\.gif$)", re.I)


def image_du_flux(e):
    url = _image_du_flux(e)
    return agrandir(html.unescape(url)) if url and not PUB.search(url) else None


def _image_du_flux(e):
    candidats = []
    for m in e.get("media_content", []) or []:
        if m.get("url") and (m.get("medium") in (None, "image") or "image" in (m.get("type") or "")):
            candidats.append((int(m.get("width") or 0), m["url"]))
    if candidats:
        return max(candidats)[1]
    for m in e.get("media_thumbnail", []) or []:
        if m.get("url"):
            return m["url"]
    for l in e.get("links", []):
        if l.get("rel") == "enclosure" and "image" in (l.get("type") or ""):
            return l.get("href")
    contenu = "".join(c.get("value", "") for c in e.get("content", []) or []) + e.get("summary", "")
    for src in re.findall(r"<img[^>]+src=[\"']([^\"']+)", contenu):
        if not PUB.search(src):
            return src
    return None


def agrandir(url):
    # Les miniatures WordPress "-300x200.jpg" ont souvent une version pleine taille.
    if "/wp-content/" in url:
        return re.sub(r"-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp)$)", "", url)
    # Batiactu : vignettes "/images/auto/300-226-c/" -> "/1200-900-c/"
    return re.sub(r"(batiactu\.com/images/auto/)\d+-\d+-c/", r"\g<1>1200-900-c/", url)


def image_de_la_page(url):
    try:
        page = telecharger(url, limite=400_000, essais=1).decode("utf8", "ignore")
    except Exception:  # noqa: BLE001
        return None
    for prop in ("og:image", "twitter:image"):
        m = re.search(r"<meta[^>]+(?:property|name)=[\"']" + prop + r"(?::url)?[\"'][^>]*content=[\"']([^\"']+)", page) or \
            re.search(r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*(?:property|name)=[\"']" + prop + r"[\"']", page)
        if m:
            return urllib.parse.urljoin(url, html.unescape(m.group(1)))
    return None


# ---------------------------------------------------------------- collecte

class Tri:
    def __init__(self, filtres):
        self.exclure = motif(filtres.get("exclure", []))
        self.themes = {t: motif(m) for t, m in (filtres.get("themes") or {}).items()}
        self.favoris = motif(filtres.get("favoris", []))
        self.france = motif(filtres.get("france", []))

    def exclu(self, titre, extrait):
        return bool(self.exclure and self.exclure.search(normaliser(titre + " " + extrait[:150])))

    def classer(self, titre, extrait, source):
        """Renvoie (theme, mots trouvés) ou (None, ...) si hors sujet."""
        t_norm, x_norm = normaliser(titre), normaliser(extrait)
        scores, trouves = {}, set()
        hors_titre = set()
        for theme, rx in self.themes.items():
            if not rx:
                continue
            dans_titre = set(rx.findall(t_norm))
            dans_texte = set(rx.findall(x_norm)) - dans_titre
            trouves |= dans_titre | dans_texte
            hors_titre |= dans_texte
            scores[theme] = 2 * len(dans_titre) + len(dans_texte)
        # Sources généralistes : un mot du thème dans le titre, ou au moins deux dans le texte.
        if source["tri"] == "mots-cles" and trouves == hors_titre and len(hors_titre) < 2:
            return None, trouves
        bonus = 3 if (len(source["themes"]) == 1 and source["tri"] == "tout") else 1.5
        for t in source["themes"]:
            scores[t] = scores.get(t, 0) + bonus
        return max(scores, key=scores.get), trouves


def lire_sources():
    data = yaml.safe_load((RACINE / "sources.yaml").read_text(encoding="utf8"))
    sources = []
    for genre in ("articles", "youtube"):
        for s in data.get(genre) or []:
            if str(s.get("actif", "oui")).lower() in ("non", "false", "no"):
                continue
            s["genre"] = genre
            s["themes"] = [t.strip() for t in (s.get("themes") or [])]
            s["tri"] = s.get("tri", "tout")
            s["langue"] = s.get("langue", "fr")
            if genre == "youtube":
                s["flux"] = f"https://www.youtube.com/feeds/videos.xml?channel_id={s['chaine']}"
            sources.append(s)
    return sources


def date_de(e):
    d = e.get("published_parsed") or e.get("updated_parsed")
    return datetime(*d[:6], tzinfo=timezone.utc) if d else datetime.now(timezone.utc)


UNITES = {"second": 1, "minute": 60, "hour": 3600, "day": 86400, "week": 604800, "month": 2592000, "year": 31536000,
          "seconde": 1, "heure": 3600, "jour": 86400, "semaine": 604800, "mois": 2592000, "an": 31536000}


def videos_de_la_page(chaine, langue, maintenant):
    """Secours quand le flux RSS YouTube est refusé : lit la page « Vidéos » de la chaîne."""
    # Page demandée dans la langue de la chaîne, sinon YouTube traduit les titres.
    hl = "fr" if langue == "fr" else "en"
    entetes = {**UA, "Accept-Language": f"{hl};q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI"}
    req = urllib.request.Request(f"https://www.youtube.com/channel/{chaine}/videos?hl={hl}&gl=FR", headers=entetes)
    with urllib.request.urlopen(req, timeout=25) as r:
        page = r.read().decode("utf8", "ignore")
    m = re.search(r"ytInitialData\s*=\s*(\{.+?\})\s*;\s*</script>", page, re.S)
    if not m:
        raise ValueError("page YouTube illisible")
    trouves = []

    def parcourir(o):
        if isinstance(o, dict):
            if "lockupViewModel" in o or "videoRenderer" in o:
                trouves.append(o)
                return
            for v in o.values():
                parcourir(v)
        elif isinstance(o, list):
            for v in o:
                parcourir(v)

    parcourir(json.loads(m.group(1)))
    entrees = []
    for o in trouves:
        if "videoRenderer" in o:
            v = o["videoRenderer"]
            vid, titre = v.get("videoId"), "".join(r.get("text", "") for r in v.get("title", {}).get("runs", []))
            quand = v.get("publishedTimeText", {}).get("simpleText", "")
            resume = "".join(r.get("text", "") for r in v.get("descriptionSnippet", {}).get("runs", []))
        else:
            v = o["lockupViewModel"]
            if v.get("contentType") != "LOCKUP_CONTENT_TYPE_VIDEO":
                continue
            md = v.get("metadata", {}).get("lockupMetadataViewModel", {})
            vid, titre, resume = v.get("contentId"), md.get("title", {}).get("content", ""), ""
            quand = json.dumps(md.get("metadata", {}))
        age = re.search(r"(\d+) (second|minute|hour|day|week|month|year)s? ago", quand) or \
            re.search(r"il y a (\d+)\s(seconde|minute|heure|jour|semaine|mois|an)", quand)
        if not vid or not titre or not age:
            continue  # vidéo programmée ou en direct : on ignore
        date = datetime.fromtimestamp(maintenant.timestamp() - int(age.group(1)) * UNITES[age.group(2)], timezone.utc)
        entrees.append({"link": f"https://www.youtube.com/watch?v={vid}", "title": titre, "summary": resume,
                        "yt_videoid": vid, "published_parsed": date.utctimetuple()})
    if not entrees:
        raise ValueError("aucune vidéo trouvée sur la page")
    return entrees


def lire_source(source, tri, maintenant):
    video = source["genre"] == "youtube"
    try:
        flux = feedparser.parse(telecharger(source["flux"], essais=2))
        entrees = flux.entries
        if not entrees:
            raise ValueError("flux vide ou illisible")
    except Exception:
        if not video:
            raise
        # Le flux RSS YouTube est souvent refusé depuis les serveurs : plan B.
        time.sleep(1)
        entrees = videos_de_la_page(source["chaine"], source["langue"], maintenant)
    age_max = AGE_MAX_VIDEO if video else AGE_MAX_ARTICLE
    gardes, ecartes = [], 0
    for e in entrees:
        lien = e.get("link")
        titre = nettoyer_html(e.get("title", ""))
        if not lien or not titre or PUB.search(lien):
            continue
        date = date_de(e)
        if (maintenant - date).days > age_max:
            continue
        # "Titre | Nom de la chaîne" -> "Titre"
        titre = re.sub(r"\s*[|\-–—]\s*" + re.escape(source["nom"].split(" (")[0]) + r"\s*$", "", titre, flags=re.I) or titre
        extrait = nettoyer_html(e.get("summary", ""))
        if video:
            # Les descriptions YouTube : on garde les premières lignes, sans liens ni hashtags.
            lignes = [l for l in (e.get("summary", "") or "").splitlines()
                      if l.strip() and "http" not in l and not l.strip().startswith("#")]
            extrait = nettoyer_html(" ".join(lignes[:3]))
        if tri.exclu(titre, extrait):
            ecartes += 1
            continue
        theme, mots_theme = tri.classer(titre, extrait, source)
        if not theme:
            ecartes += 1
            continue
        item = {
            "id": hashlib.sha1(url_canonique(lien).encode()).hexdigest()[:12],
            "type": "video" if video else "article",
            "titre": titre,
            "extrait": couper(extrait),
            "url": lien,
            "image": None,
            "source": source["nom"],
            "langue": source["langue"],
            "theme": theme,
            "date": date.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "mots": sorted(mots_theme | set(sorted(jetons(titre), key=len, reverse=True)[:6])),
            "favori": bool(tri.favoris and tri.favoris.search(normaliser(titre + " " + extrait))),
            "france": bool(tri.france and tri.france.search(normaliser(titre + " " + extrait))),
            # Réservés à une future étape IA (voir robot/ia.py)
            "resume": None,
            "score_ia": None,
        }
        if video:
            vid = e.get("yt_videoid") or urllib.parse.parse_qs(urllib.parse.urlsplit(lien).query).get("v", [""])[0]
            item["video"] = vid
            item["short"] = "/shorts/" in lien
            item["image"] = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
        else:
            item["image"] = image_du_flux(e)
        gardes.append(item)
    return gardes, ecartes


def dedoublonner(items):
    """Garde la meilleure version d'une même info (vidéo > image > texte, puis la plus ancienne)."""
    def qualite(it):
        return (it["type"] == "video", bool(it["image"]), -time.mktime(time.strptime(it["date"], "%Y-%m-%dT%H:%M:%SZ")))
    gardes, vus_url, signatures = [], set(), []
    for it in sorted(items, key=qualite, reverse=True):
        cle = url_canonique(it["url"])
        if cle in vus_url:
            continue
        j = jetons(it["titre"])
        t = time.mktime(time.strptime(it["date"], "%Y-%m-%dT%H:%M:%SZ"))
        doublon = None
        for autre, j2, t2 in signatures:
            if abs(t - t2) < 3 * 86400 and j and j2 and len(j & j2) / len(j | j2) >= SEUIL_DOUBLON:
                doublon = autre
                break
        if doublon:
            aussi = doublon.setdefault("aussi", [])
            if it["source"] != doublon["source"] and it["source"] not in aussi:
                aussi.append(it["source"])
            continue
        vus_url.add(cle)
        signatures.append((it, j, t))
        gardes.append(it)
    return gardes


def main():
    maintenant = datetime.now(timezone.utc)
    sources = lire_sources()
    tri = Tri(yaml.safe_load((RACINE / "filtres.yaml").read_text(encoding="utf8")) or {})
    SORTIE.mkdir(parents=True, exist_ok=True)

    ancien = {}
    fichier = SORTIE / "feed.json"
    if fichier.exists():
        try:
            ancien = {it["id"]: it for it in json.loads(fichier.read_text(encoding="utf8"))["items"]}
        except Exception:  # noqa: BLE001
            ancien = {}

    etat, nouveaux = [], []
    # YouTube refuse les rafales : ses chaînes passent deux par deux.
    with cf.ThreadPoolExecutor(12) as ex, cf.ThreadPoolExecutor(2) as ex_yt:
        taches = {(ex_yt if s["genre"] == "youtube" else ex).submit(lire_source, s, tri, maintenant): s for s in sources}
        for f in cf.as_completed(taches):
            s = taches[f]
            try:
                items, ecartes = f.result()
                nouveaux += items
                etat.append({"nom": s["nom"], "genre": s["genre"], "ok": True, "gardes": len(items), "ecartes": ecartes})
            except Exception as e:  # noqa: BLE001
                etat.append({"nom": s["nom"], "genre": s["genre"], "ok": False, "erreur": str(e)[:120]})
                print(f"  ✗ {s['nom']} : {e}", file=sys.stderr)

    # Fusion avec le fil précédent : on garde les images déjà trouvées et les
    # éléments des sources momentanément en panne.
    noms_actifs = {s["nom"] for s in sources}
    tous = {k: v for k, v in ancien.items() if v["source"] in noms_actifs}
    for it in nouveaux:
        if it["id"] in tous:
            precedent = tous[it["id"]]
            it["image"] = it["image"] or precedent.get("image")
            it["resume"] = precedent.get("resume")
            it["score_ia"] = precedent.get("score_ia")
        tous[it["id"]] = it

    # Les mots exclus s'appliquent aussi aux anciens contenus (si on en ajoute dans filtres.yaml).
    tous = {k: v for k, v in tous.items() if not tri.exclu(v["titre"], v.get("extrait") or "")}

    # Images manquantes : on ouvre la page de l'article (balise og:image).
    sans_image = [it for it in tous.values() if not it["image"] and not it.get("image_cherchee")]
    sans_image.sort(key=lambda it: it["date"], reverse=True)
    with cf.ThreadPoolExecutor(10) as ex:
        for it, img in zip(sans_image[:MAX_IMAGES_A_CHERCHER],
                           ex.map(lambda it: image_de_la_page(it["url"]), sans_image[:MAX_IMAGES_A_CHERCHER])):
            it["image"] = img
            it["image_cherchee"] = True

    # Âge maximum, puis plafond par source.
    def age(it):
        return (maintenant - datetime.strptime(it["date"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).days
    items = [it for it in tous.values() if age(it) <= (AGE_MAX_VIDEO if it["type"] == "video" else AGE_MAX_ARTICLE)]
    for it in items:
        it.pop("aussi", None)
    items = dedoublonner(items)
    par_source = {}
    for it in sorted(items, key=lambda it: it["date"], reverse=True):
        par_source.setdefault(it["source"], []).append(it)
    items = [it for lot in par_source.values() for it in lot[:MAX_PAR_SOURCE]]

    items = [enrichir(it) if it["id"] not in ancien else it for it in items]
    items.sort(key=lambda it: it["date"], reverse=True)

    if not items:
        print("Aucun élément récupéré : on garde l'ancien fil.", file=sys.stderr)
        sys.exit(1)

    genere = maintenant.strftime("%Y-%m-%dT%H:%M:%SZ")
    fichier.write_text(json.dumps({"genere": genere, "items": items}, ensure_ascii=False, separators=(",", ":")),
                       encoding="utf8")
    etat.sort(key=lambda e: (e["ok"], e["nom"]))
    (SORTIE / "etat.json").write_text(json.dumps({"genere": genere, "sources": etat}, ensure_ascii=False, indent=1),
                                      encoding="utf8")

    ok = sum(e["ok"] for e in etat)
    print(f"{len(items)} éléments dans le fil, {ok}/{len(etat)} sources OK.")
    from collections import Counter
    print("Par thème :", dict(Counter(it["theme"] for it in items)))
    print("Sans image :", sum(not it["image"] for it in items))


if __name__ == "__main__":
    main()
