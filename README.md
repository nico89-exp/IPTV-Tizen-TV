# IPTV Manager — Samsung Tizen TV

Application IPTV complète pour **Samsung Smart TV** (Tizen 6.0+), packagée au format `.wgt`.

## Fonctionnalités

- 📡 **TV en direct** — Chaînes IPTV via Xtream Codes
- 🎬 **Films (VOD)** — Médiathèque de films à la demande
- 📺 **Séries** — Saisons et épisodes avec sélecteur
- ⭐ **Favoris** — Gestion chaînes/films/séries favoris
- 🕐 **Historique** — Reprise automatique de la lecture
- 🎮 **Navigation D-pad** — Optimisé télécommande Samsung

## Navigation télécommande

| Touche | Action |
|--------|--------|
| ↑ ↓ ← → | Naviguer dans les menus |
| OK / Enter | Sélectionner / Lancer |
| Return / Back | Retour / Fermer |
| ← (contenu) | Ouvrir menu latéral |
| Play/Pause | Lecture / Pause |
| ← → (lecteur) | Reculer / Avancer 10s |
| ↑ ↓ (lecteur) | Avancer / Reculer 30s |
| Touche Rouge | Ajouter / Retirer des favoris |

## Installation sur Samsung TV

### Méthode 1 — Mode Développeur (sideloading)

1. Activez le **mode développeur** sur votre TV :
   - Allez dans `Paramètres > Support > Mode Développeur`
   - Ou : depuis l'écran d'accueil, tapez **12345** sur la télécommande
   - Activez "Développeur" et entrez l'IP de votre ordinateur

2. Connectez-vous en SSH / via **Tizen Studio** :
   ```bash
   sdb connect <IP_TV>:26101
   sdb push IPTVManager.wgt /opt/usr/apps/tmp/
   sdb shell 0 pkgcmd -i -t wgt -p /opt/usr/apps/tmp/IPTVManager.wgt -q
   ```

3. Ou utilisez la commande **tizen CLI** :
   ```bash
   tizen install -n IPTVManager.wgt -t <device_id>
   ```

### Méthode 2 — Tizen Studio (IDE)

1. Importez ce projet dans **Tizen Studio**
2. Faites un clic droit > **Run As** > **Tizen Web Application**
3. Sélectionnez votre TV connectée au même réseau

### Méthode 3 — Packager le WGT manuellement

```bash
# Installer Tizen CLI
npm install -g @tizen/tizen-cli

# Signer et packager
tizen package -t wgt -s <certificate_profile> -- .

# Installer sur TV connectée
tizen install -n IPTVManager.wgt -t <device_id>
```

## Structure du projet

```
iptv-tizen-tv/
├── index.html          # Page principale
├── config.xml          # Manifest Tizen WGT
├── css/
│   └── styles.css      # Styles UI TV 1080p
├── js/
│   ├── storage.js      # Stockage localStorage
│   ├── xtream-api.js   # Client API Xtream Codes
│   ├── player.js       # Lecteur vidéo HLS/TS
│   ├── navigation.js   # Navigation D-pad Tizen
│   └── app.js          # Logique principale
├── libs/
│   └── hls.min.js      # hls.js pour streams HLS
└── images/
    ├── icon.png         # Icône app 512×512
    └── icon-tv.png      # Icône TV Samsung
```

## Configuration requise

- Samsung Smart TV avec **Tizen 6.0** ou supérieur (2021+)
- Connexion Internet (Wi-Fi ou Ethernet)
- Compte Xtream Codes valide

## Technologies utilisées

- HTML5 + CSS3 + JavaScript ES6+
- [hls.js](https://github.com/video-dev/hls.js/) pour la lecture HLS
- API Tizen TV pour les touches télécommande
- localStorage pour la persistance des données

## Compte Xtream Codes

L'application supporte les serveurs au format **Xtream Codes** :
- URL : `http://votreserveur.com:8080`
- Nom d'utilisateur + Mot de passe

---

> **Note légale** : Cette application est un lecteur multimédia.
> L'utilisateur est responsable du contenu qu'il diffuse.
> Respectez les droits d'auteur et les conditions d'utilisation de votre fournisseur IPTV.
