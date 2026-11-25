# Grimorio

App per Android TV e Fire TV Stick in stile Netflix, tutta in italiano.

- **Classici gratuiti**: film di pubblico dominio da Internet Archive, da guardare direttamente nell'app. Il fantasy è in primo piano.
- **Gratis sulle piattaforme**: cataloghi di RaiPlay, Mediaset Infinity, Pluto TV e Rakuten TV (dati TMDB). Il titolo si apre nell'app ufficiale.
- **TV in diretta**: tutti i canali principali, che si aprono nelle app ufficiali.
- Ricerca per titolo, attore e genere. Tasto "Mi piace" con consigli, "La mia lista" e "Continua a guardare".

## Installare
Ogni modifica crea un nuovo APK in **Releases**. Link sempre aggiornato:
`https://github.com/<utente>/<repo>/releases/latest/download/Grimorio.apk`

Fire TV Stick: Impostazioni → La mia Fire TV → Opzioni sviluppatore → App da origini sconosciute → attiva per **Downloader**. Apri Downloader, scrivi il link e installa.
Android TV: installa **Downloader** dal Play Store e segui gli stessi passaggi.

## Chiave TMDB
Mettila in `app/src/main/assets/config.js` (campo `tmdbKey`). Senza chiave l'app funziona lo stesso, ma senza la sezione Piattaforme.

## Nota sui contenuti
I classici vengono da collezioni di pubblico dominio di Internet Archive (pubblico dominio secondo le regole USA, che usa Archive). I contenuti delle piattaforme si guardano sempre nelle loro app ufficiali.
