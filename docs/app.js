'use strict';

/* =====================================================================
   Fil : appli de lecture. Tout ce qui est appris reste sur l'appareil
   (localStorage). Les données viennent de data/feed.json, produit par
   robot/collecte.py.
   ===================================================================== */

const CLE = 'fil.v1';
const NOMS = { enr: 'ENR', nucleaire: 'Nucléaire', batiment: 'Bâtiment', chantier: 'Chantier' };

// Réglages de l'apprentissage
const REGLES = {
  passageRapide: 1500,   // ms : en dessous, la carte est considérée comme zappée
  lectureLongue: 8000,   // ms : au-dessus, la carte a intéressé
  lectureTresLongue: 20000,
  exploration: 5,        // 1 carte sur 5 est tirée au hasard (découverte)
  oubliParJour: 0.97,    // les goûts s'estompent doucement avec le temps
  borne: 4,
};

const $ = (s, el = document) => el.querySelector(s);
const fil = $('#fil');
const modele = $('#modele-carte');

/* ---------------------------------------------------------------- mémoire */

function defaut() {
  return { vus: {}, likes: {}, sauves: {}, ouverts: {}, poids: { s: {}, t: {}, k: {} }, filtre: 'tout', oubli: Date.now() };
}
function charger() {
  try {
    const e = JSON.parse(localStorage.getItem(CLE));
    if (e) {
      const d = defaut();
      return { ...d, ...e, poids: { ...d.poids, ...e.poids } };
    }
  } catch { /* stockage indisponible : on repart de zéro */ }
  return defaut();
}
const etat = charger();
let minuteurSauvegarde;
function sauver() {
  clearTimeout(minuteurSauvegarde);
  minuteurSauvegarde = setTimeout(() => {
    try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* plein ou bloqué */ }
  }, 250);
}

function entretien() {
  const jours = (Date.now() - (etat.oubli || Date.now())) / 864e5;
  if (jours >= 1) {
    const f = Math.pow(REGLES.oubliParJour, jours);
    for (const groupe of Object.values(etat.poids)) {
      for (const k in groupe) {
        groupe[k] *= f;
        if (Math.abs(groupe[k]) < 0.02) delete groupe[k];
      }
    }
    etat.oubli = Date.now();
  }
  const limite = Date.now() - 90 * 864e5;
  for (const id in etat.vus) if (etat.vus[id] < limite) delete etat.vus[id];
  sauver();
}

/* ---------------------------------------------------------------- goûts */

const borne = (x) => Math.max(-REGLES.borne, Math.min(REGLES.borne, x));

function ajuster(it, d) {
  const p = etat.poids;
  p.s[it.source] = borne((p.s[it.source] || 0) + d);
  p.t[it.theme] = borne((p.t[it.theme] || 0) + d * 0.6);
  for (const k of it.mots || []) p.k[k] = borne((p.k[k] || 0) + d * 0.35);
  sauver();
}

function preference(it) {
  const p = etat.poids;
  const ks = (it.mots || []).map((k) => p.k[k] || 0);
  const mots = ks.length ? ks.reduce((a, b) => a + b, 0) / Math.sqrt(ks.length) : 0;
  return 0.5 * (p.s[it.source] || 0) + 0.35 * (p.t[it.theme] || 0) + 0.25 * borne(mots);
}

function score(it) {
  const age = (Date.now() - Date.parse(it.date)) / 864e5;
  const demiVie = it.type === 'video' ? 10 : 3.5;
  let s = -0.6 * (age / demiVie);
  s += preference(it);
  if (it.favori) s += 0.4;
  if (typeof it.score_ia === 'number') s += 0.8 * it.score_ia; // réservé à une future IA
  if (it.type === 'video') s += 0.15;
  if (!it.image) s -= 0.6;
  return s + Math.random() * 0.35;
}

/* ---------------------------------------------------------------- file d'attente */

let tous = [];
let genere = null;
let file = [];       // éléments à afficher, dans l'ordre
let rendu = 0;       // nombre de cartes déjà dans la page
let mode = 'fil';    // 'fil' ou 'favoris'
let finAffichee = false;

function correspond(it) {
  return etat.filtre === 'tout' || it.theme === etat.filtre;
}

function composer(candidats) {
  const reserve = candidats.map((it) => [score(it), it]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const sortie = [];
  while (reserve.length) {
    let i = 0;
    if ((sortie.length + 1) % REGLES.exploration === 0 && reserve.length > 4) {
      // Découverte : un élément pris au hasard dans le bas du classement.
      const debut = Math.floor(reserve.length * 0.3);
      i = debut + Math.floor(Math.random() * (reserve.length - debut));
    } else {
      // Variété : éviter deux fois de suite la même source.
      const a = sortie.at(-1)?.source;
      const b = sortie.at(-2)?.source;
      const j = reserve.slice(0, 8).findIndex((it) => it.source !== a && it.source !== b);
      i = j < 0 ? 0 : j;
    }
    sortie.push(reserve.splice(i, 1)[0]);
  }
  return sortie;
}

function reconstruire({ revoir = false } = {}) {
  quitter();
  fil.replaceChildren();
  rendu = 0;
  finAffichee = false;
  if (mode === 'favoris') {
    file = Object.values(etat.sauves).sort((a, b) => (b._sauve || 0) - (a._sauve || 0));
  } else {
    file = composer(tous.filter((it) => correspond(it) && (revoir || !etat.vus[it.id])));
  }
  fil.scrollTop = 0;
  completer();
}

function completer() {
  const n = Math.min(file.length, rendu + 6);
  for (; rendu < n; rendu++) fil.append(creerCarte(file[rendu]));
  if (rendu >= file.length && !finAffichee) {
    finAffichee = true;
    fil.append(carteFin());
  }
}

/* ---------------------------------------------------------------- cartes */

function relatif(iso) {
  const d = new Date(iso);
  const min = (Date.now() - d) / 6e4;
  if (min < 60) return `il y a ${Math.max(1, Math.round(min))} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  if (min < 2880) return 'hier';
  if (min < 10080) return `il y a ${Math.round(min / 1440)} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function affiche(media, it) {
  media.replaceChildren();
  media.classList.add('affiche');
  media.dataset.lettre = (NOMS[it.theme] || '?')[0];
}

function poserImage(media, it) {
  if (!it.image) return affiche(media, it);
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.alt = '';
  img.onload = () => {
    if (img.naturalWidth < 320) return affiche(media, it);
    const portrait = fil.clientHeight > fil.clientWidth * 1.2;
    if (portrait && img.naturalWidth / img.naturalHeight > 1.15) {
      const flou = img.cloneNode();
      flou.className = 'flou';
      img.className = 'net';
      media.append(flou, img);
    } else {
      img.className = 'plein';
      media.append(img);
    }
  };
  img.onerror = () => affiche(media, it);
  img.src = it.image;
}

function poserVideo(media, it) {
  const vignette = new Image();
  vignette.referrerPolicy = 'no-referrer';
  vignette.alt = '';
  vignette.className = 'vignette';
  vignette.src = `https://i.ytimg.com/vi/${it.video}/${it.short ? 'hqdefault' : 'maxresdefault'}.jpg`;
  vignette.onerror = () => { if (!vignette.src.includes('hqdefault')) vignette.src = `https://i.ytimg.com/vi/${it.video}/hqdefault.jpg`; };
  const lecteur = document.createElement('div');
  lecteur.className = 'lecteur' + (it.short ? ' court' : '');
  const bouton = document.createElement('button');
  bouton.className = 'jouer';
  bouton.setAttribute('aria-label', 'Lire la vidéo');
  bouton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
  lecteur.append(vignette, bouton);
  if (it.short) {
    const t = document.createElement('span');
    t.className = 'duree-court';
    t.textContent = 'SHORT';
    lecteur.append(t);
  } else {
    const flou = vignette.cloneNode();
    flou.className = 'flou';
    flou.src = `https://i.ytimg.com/vi/${it.video}/hqdefault.jpg`;
    media.append(flou);
  }
  media.append(lecteur);
}

function creerCarte(it) {
  const carte = modele.content.firstElementChild.cloneNode(true);
  carte.item = it;
  carte.dataset.id = it.id;
  carte.style.setProperty('--c', `var(--${it.theme})`);
  $('.tag', carte).textContent = NOMS[it.theme] || it.theme;
  $('.source', carte).textContent = `${it.source} · ${relatif(it.date)}`;
  $('.titre', carte).textContent = it.titre;
  $('.extrait', carte).textContent = it.resume || it.extrait || '';
  if (it.aussi?.length) $('.aussi', carte).textContent = `Aussi chez ${it.aussi.join(', ')}`;
  $('[data-act="trad"]', carte).hidden = it.langue !== 'en';
  $('[data-act="like"]', carte).classList.toggle('on', !!etat.likes[it.id]);
  $('[data-act="save"]', carte).classList.toggle('on', !!etat.sauves[it.id]);
  const media = $('.media', carte);
  if (it.type === 'video') poserVideo(media, it); else poserImage(media, it);
  observateur.observe(carte);
  return carte;
}

function carteFin() {
  const c = document.createElement('section');
  c.className = 'carte fin';
  if (mode === 'favoris') {
    c.innerHTML = file.length
      ? '<h2>Fin des favoris</h2><p>Touche le marque-page sur une carte pour en ajouter.</p>'
      : '<h2>Aucun favori</h2><p>Touche le marque-page sur une carte pour la garder ici.</p>';
  } else {
    const prochaine = genere ? new Date(Date.parse(genere) + 3 * 36e5) : null;
    c.innerHTML = `<h2>Tu as tout vu</h2>
      <p>${file.length ? `${file.length} contenus parcourus.` : 'Rien de neuf dans ce thème.'}
      ${prochaine ? `Prochain arrivage vers ${prochaine.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` : ''}</p>
      <div><button class="plein" data-revoir>Revoir d'anciens contenus</button></div>`;
    $('[data-revoir]', c).onclick = () => reconstruire({ revoir: true });
  }
  return c;
}

/* ---------------------------------------------------------------- carte active, temps passé */

let courante = null;
let debut = 0;
let minuteurVu;
const dejaNote = new Set(); // une seule note de « temps passé » par carte et par session

const observateur = new IntersectionObserver((entrees) => {
  for (const e of entrees) if (e.isIntersecting) activer(e.target);
}, { root: fil, threshold: 0.6 });

function activer(carte) {
  if (carte === courante) return;
  quitter();
  courante = carte;
  debut = performance.now();
  carte.classList.add('active');
  const it = carte.item;
  clearTimeout(minuteurVu);
  minuteurVu = setTimeout(() => {
    if (courante === carte && mode === 'fil' && !etat.vus[it.id]) { etat.vus[it.id] = Date.now(); sauver(); }
  }, 800);
  const index = [...fil.children].indexOf(carte);
  if (index >= rendu - 3) completer();
}

function quitter() {
  const carte = courante;
  if (!carte) return;
  courante = null;
  carte.classList.remove('active', 'deplie');
  arreterVideo(carte);
  const it = carte.item;
  if (!it || mode !== 'fil' || dejaNote.has(it.id)) return;
  dejaNote.add(it.id);
  etat.vus[it.id] = etat.vus[it.id] || Date.now();
  const duree = performance.now() - debut;
  if (carte.dataset.reaction) return; // like, sauvegarde… déjà comptés
  if (duree < REGLES.passageRapide) ajuster(it, -0.25);
  else if (duree > REGLES.lectureTresLongue) ajuster(it, 0.45);
  else if (duree > REGLES.lectureLongue) ajuster(it, 0.25);
  sauver();
}

/* ---------------------------------------------------------------- vidéo */

function jouer(carte) {
  const it = carte.item;
  const lecteur = $('.lecteur', carte);
  if (!lecteur || $('iframe', lecteur)) return;
  const f = document.createElement('iframe');
  f.src = `https://www.youtube-nocookie.com/embed/${it.video}?autoplay=1&playsinline=1&rel=0&modestbranding=1&hl=fr&cc_lang_pref=fr`;
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  lecteur.replaceChildren(f);
  carte.classList.add('lecture');
  if (mode === 'fil' && !carte.dataset.lu) { carte.dataset.lu = 1; carte.dataset.reaction = 1; ajuster(it, 0.4); }
}

function arreterVideo(carte) {
  if (!carte.item || carte.item.type !== 'video' || !$('iframe', carte)) return;
  const media = $('.media', carte);
  media.replaceChildren();
  poserVideo(media, carte.item);
  carte.classList.remove('lecture');
}

/* ---------------------------------------------------------------- actions */

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('vu');
  clearTimeout(t._m);
  t._m = setTimeout(() => t.classList.remove('vu'), 1600);
}

function agir(carte, act) {
  const it = carte.item;
  if (!it) return;
  const bouton = $(`[data-act="${act}"]`, carte);
  if (act === 'like') {
    const on = !etat.likes[it.id];
    if (on) etat.likes[it.id] = { ...it, _like: Date.now() }; else delete etat.likes[it.id];
    bouton.classList.toggle('on', on);
    ajuster(it, on ? 1 : -1);
    carte.dataset.reaction = 1;
  } else if (act === 'save') {
    const on = !etat.sauves[it.id];
    if (on) etat.sauves[it.id] = { ...it, _sauve: Date.now() }; else delete etat.sauves[it.id];
    bouton.classList.toggle('on', on);
    ajuster(it, on ? 1.2 : -0.4);
    carte.dataset.reaction = 1;
    toast(on ? 'Ajouté aux favoris' : 'Retiré des favoris');
  } else if (act === 'open') {
    window.open(it.url, '_blank', 'noopener');
    if (!etat.ouverts[it.id]) { etat.ouverts[it.id] = 1; ajuster(it, 0.6); }
    carte.dataset.reaction = 1;
  } else if (act === 'trad') {
    const url = it.type === 'video'
      ? `https://translate.google.com/?sl=en&tl=fr&op=translate&text=${encodeURIComponent(`${it.titre}\n\n${it.extrait || ''}`)}`
      : `https://translate.google.com/translate?sl=en&tl=fr&u=${encodeURIComponent(it.url)}`;
    window.open(url, '_blank', 'noopener');
    ajuster(it, 0.2);
  }
  sauver();
}

let dernierClic = 0;
fil.addEventListener('click', (e) => {
  const carte = e.target.closest('.carte');
  if (!carte || !carte.item) return;
  const act = e.target.closest('[data-act]');
  if (act) return agir(carte, act.dataset.act);
  if (e.target.closest('.jouer')) return jouer(carte);
  const maintenant = Date.now();
  if (maintenant - dernierClic < 320) {
    // double tape : j'aime
    dernierClic = 0;
    if (!etat.likes[carte.item.id]) agir(carte, 'like');
    const r = carte.getBoundingClientRect();
    const coeur = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    coeur.setAttribute('viewBox', '0 0 24 24');
    coeur.classList.add('coeur');
    coeur.innerHTML = '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/>';
    coeur.style.left = `${e.clientX - r.left}px`;
    coeur.style.top = `${e.clientY - r.top}px`;
    carte.append(coeur);
    setTimeout(() => coeur.remove(), 800);
    return;
  }
  dernierClic = maintenant;
  if (e.target.closest('.texte')) carte.classList.toggle('deplie');
});

/* ---------------------------------------------------------------- navigation */

function defiler(sens) {
  fil.scrollBy({ top: sens * fil.clientHeight, behavior: 'smooth' });
}

document.addEventListener('keydown', (e) => {
  if ($('#menu').open || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (['arrowdown', 'j', 'pagedown'].includes(k)) { e.preventDefault(); defiler(1); }
  else if (['arrowup', 'k', 'pageup'].includes(k)) { e.preventDefault(); defiler(-1); }
  else if (courante?.item) {
    if (k === 'l') agir(courante, 'like');
    else if (k === 's') agir(courante, 'save');
    else if (k === 'o') agir(courante, 'open');
    else if (k === 't' && courante.item.langue === 'en') agir(courante, 'trad');
    else if (k === ' ' && courante.item.type === 'video') { e.preventDefault(); jouer(courante); }
  }
});

$('#themes').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  etat.filtre = b.dataset.filtre;
  sauver();
  majFiltres();
  reconstruire();
});
function majFiltres() {
  for (const b of $('#themes').children) b.classList.toggle('actif', b.dataset.filtre === etat.filtre);
}

function basculerFavoris(ouvrir) {
  mode = ouvrir ? 'favoris' : 'fil';
  document.body.classList.toggle('vue-favoris', ouvrir);
  $('#bandeau-favoris').hidden = !ouvrir;
  $('#nb-favoris').textContent = Object.keys(etat.sauves).length;
  reconstruire();
}
$('#btn-favoris').onclick = () => basculerFavoris(mode !== 'favoris');
$('#retour').onclick = () => basculerFavoris(false);

/* ---------------------------------------------------------------- menu */

const menu = $('#menu');
$('#btn-menu').onclick = () => { remplirMenu(); menu.showModal(); };
menu.addEventListener('click', (e) => {
  if (e.target === menu || e.target.closest('[data-fermer]')) menu.close();
});

function jauges(paires) {
  return paires.map(([nom, v]) => {
    const l = Math.min(50, Math.abs(v) / REGLES.borne * 50);
    const style = v >= 0 ? `left:50%;width:${l}%;background:var(--enr)` : `left:${50 - l}%;width:${l}%;background:#ff5a6e`;
    return `<div class="gout"><span>${echapper(nom)}</span><div class="jauge"><i style="${style}"></i></div></div>`;
  }).join('');
}
function echapper(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function remplirMenu() {
  const vus = Object.keys(etat.vus).length;
  $('#maj').textContent = genere
    ? `Mis à jour ${relatif(genere)} · ${tous.length} contenus · ${vus} vus`
    : 'Pas encore de données';
  const p = etat.poids;
  const themes = Object.keys(NOMS).map((t) => [NOMS[t], p.t[t] || 0]);
  const sources = Object.entries(p.s).sort((a, b) => b[1] - a[1]);
  const haut = sources.filter((x) => x[1] > 0.05).slice(0, 5);
  const bas = sources.filter((x) => x[1] < -0.05).slice(-4);
  const mots = Object.entries(p.k).sort((a, b) => b[1] - a[1]).filter((x) => x[1] > 0.1).slice(0, 8).map((x) => x[0]);
  $('#gouts').innerHTML = jauges(themes)
    + (haut.length ? `<h3>Sources préférées</h3>${jauges(haut)}` : '')
    + (bas.length ? `<h3>Sources zappées</h3>${jauges(bas)}` : '')
    + (mots.length ? `<p class="petit">Mots qui te plaisent : ${mots.map(echapper).join(', ')}</p>` : '')
    + (!haut.length && !bas.length ? '<p class="petit">Rien encore : like, sauve ou zappe quelques cartes.</p>' : '');
  try {
    const r = await fetch('data/etat.json', { cache: 'no-store' });
    const d = await r.json();
    const ko = d.sources.filter((s) => !s.ok);
    $('#etat').innerHTML = (ko.length ? ko.map((s) => `<div class="ko">✗ ${echapper(s.nom)} — en pause (${echapper(s.erreur || 'erreur')})</div>`).join('') : '')
      + `<div class="ok">${d.sources.length - ko.length} sources sur ${d.sources.length} répondent. Une source en pause garde ses anciens contenus.</div>`;
  } catch {
    $('#etat').textContent = 'Indisponible hors connexion.';
  }
}

$('#raz-gouts').onclick = () => {
  if (!confirm('Effacer tout ce que le fil a appris de tes goûts ? (les favoris restent)')) return;
  etat.poids = { s: {}, t: {}, k: {} };
  sauver();
  remplirMenu();
};
$('#revoir').onclick = () => {
  menu.close();
  if (mode !== 'fil') basculerFavoris(false);
  reconstruire({ revoir: true });
};
$('#exporter').onclick = () => {
  const blob = new Blob([JSON.stringify({ likes: etat.likes, sauves: etat.sauves, poids: etat.poids, vus: etat.vus }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fil-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('#importer').onchange = async (e) => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    Object.assign(etat.likes, d.likes || {});
    Object.assign(etat.sauves, d.sauves || {});
    Object.assign(etat.vus, d.vus || {});
    for (const g of ['s', 't', 'k']) {
      for (const [k, v] of Object.entries(d.poids?.[g] || {})) etat.poids[g][k] = borne(((etat.poids[g][k] || 0) + v) / (etat.poids[g][k] ? 2 : 1));
    }
    sauver();
    toast('Sauvegarde importée');
    remplirMenu();
  } catch {
    toast('Fichier illisible');
  }
  e.target.value = '';
};

/* ---------------------------------------------------------------- données */

async function chargerFil() {
  const r = await fetch('data/feed.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return d;
}

async function rafraichir() {
  try {
    const d = await chargerFil();
    if (d.genere === genere) return;
    const connus = new Set(tous.map((it) => it.id));
    tous = d.items;
    genere = d.genere;
    if (mode !== 'fil') return;
    const neufs = composer(tous.filter((it) => !connus.has(it.id) && !etat.vus[it.id] && correspond(it)));
    if (neufs.length) {
      file.splice(rendu, 0, ...neufs);
      if (finAffichee) { fil.lastElementChild.remove(); finAffichee = false; completer(); }
      toast(`${neufs.length} nouveauté${neufs.length > 1 ? 's' : ''}`);
    }
  } catch { /* hors connexion : on garde ce qu'on a */ }
}

let cacheDepuis = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cacheDepuis = Date.now();
  else if (Date.now() - cacheDepuis > 20 * 6e4) rafraichir();
});

async function demarrer() {
  entretien();
  majFiltres();
  try {
    const d = await chargerFil();
    tous = d.items;
    genere = d.genere;
  } catch {
    fil.innerHTML = '<section class="carte fin"><h2>Hors connexion</h2><p>Impossible de charger le fil. Réessaie dans un instant.</p></section>';
    return;
  }
  reconstruire();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

demarrer();
