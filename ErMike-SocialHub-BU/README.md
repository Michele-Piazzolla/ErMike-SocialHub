# 📸 ErMike-SocialHub — README

Documentazione completa del progetto: architettura, file, comunicazione, e roadmap futura.

---

## 🗂️ Struttura delle cartelle

```
ErMike-SocialHub/
│
├── server.js              ← Cuore dell'applicazione (Node.js)
│
├── views/                 ← Template HTML (motore EJS)
│   ├── login.ejs          ← Pagina login
│   ├── register.ejs       ← Pagina registrazione
│   ├── home.ejs           ← Feed principale con i post
│   ├── createPost.ejs     ← Form per creare un post
│   ├── chat.ejs           ← Chat globale in tempo reale
│   └── partials/
│       ├── navbar.ejs     ← Barra di navigazione (inclusa in più pagine)
│       └── styles.ejs     ← CSS condiviso (colori, bottoni, card…)
│
├── public/                ← File statici serviti direttamente al browser
│   └── css/               ← (opzionale) CSS aggiuntivi
│
├── uploads/               ← Immagini caricate dagli utenti (create automaticamente)
│
├── data/                  ← "Database" locale in formato JSON (creata automaticamente)
│   ├── users.json         ← Lista utenti registrati
│   ├── posts.json         ← Lista di tutti i post
│   └── chat.json          ← Storico messaggi della chat globale
│
├── package.json           ← Dipendenze npm
└── README.md              ← Questo file
```

---

## ⚙️ Come funziona: il flusso completo

### 1. Avvio del server

```bash
node server.js
# → Server HTTP attivo su http://localhost:3000
# → Server WebSocket attivo sulla stessa porta
```

Un solo processo Node gestisce **sia le richieste HTTP** (Express) **che la chat in tempo reale** (WebSocket). Il server WebSocket condivide la stessa porta perché viene agganciato all'istanza `server` di Express.

---

### 2. Autenticazione (HTTP)

```
Browser                     Express (server.js)             data/users.json
   |                               |                               |
   |-- GET /login ---------------→ |                               |
   |← render login.ejs ----------- |                               |
   |                               |                               |
   |-- POST /login (usr, pwd) ---→ |-- legge users.json ----------→|
   |                               |←------------------------------ |
   |                               |-- confronta username+password  |
   |← redirect /home (session) --- |   (sessione salvata in RAM)    |
```

- La **sessione** (`express-session`) salva `{ id, username }` lato server.
- Ogni route protetta da `requireLogin` controlla `req.session.user`.
- La password è salvata in chiaro nel JSON — **implementazione futura**: usa `bcrypt` per hashare le password.

---

### 3. Creazione post (HTTP + multer)

```
Browser                          Express                      uploads/   posts.json
   |                               |                             |           |
   |-- GET /create-post ----------→|                             |           |
   |← render createPost.ejs ------  |                             |           |
   |                               |                             |           |
   |-- POST /create-post          →|                             |           |
   |   (text + image come form)    |-- multer salva immagine ---→|           |
   |                               |-- aggiunge post a array ---------------→|
   |← redirect /home ------------ |                             |           |
```

Il tag `enctype="multipart/form-data"` nel form EJS è **obbligatorio** per inviare file. Senza, `multer` non vede l'immagine.

---

### 4. Feed home (HTTP)

Il server legge `posts.json`, ordina per data (più recente prima) e passa l'array alla view:

```javascript
// server.js
const posts = readJSON(FILES.posts)
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
res.render('home', { user: req.session.user, posts });
```

In `home.ejs`, EJS cicla sull'array con `<% posts.forEach(post => { %>`.

---

### 5. Chat globale (WebSocket)

Il WebSocket è un canale **bidirezionale persistente** — il browser e il server rimangono collegati senza dover fare nuove richieste HTTP.

#### Protocollo messaggi

| Direzione         | Tipo | Contenuto                        | Quando                    |
|-------------------|------|----------------------------------|---------------------------|
| client → server   | `0`  | `{ tipo:0, username:"..." }`     | Appena si apre la chat    |
| client → server   | `1`  | `{ tipo:1, testo:"..." }`        | Quando si invia messaggio |
| server → client   | `1`  | `{ tipo:1, storico:[...] }`      | Dopo autenticazione ok    |
| server → client   | `2`  | `{ tipo:2, msg:{...} }`          | Nuovo messaggio broadcast |
| server → client   | `-1` | `{ tipo:-1, errore:"..." }`      | Username già connesso     |

#### Flusso

```
Browser A                   server.js (wss)                  Browser B
   |                               |                               |
   |-- WS open -----------------→  |                               |
   |-- { tipo:0, username:"A" } →  | salva A nella Map             |
   |← { tipo:1, storico:[...] } -- | invia storico                 |
   |                               |                               |
   |-- { tipo:1, testo:"ciao" } →  |                               |
   |                               | salva in chat.json            |
   |← { tipo:2, msg:{...} } ------ | broadcast a tutti i client --→|
   |                               |                               |
```

---

## 📦 Dipendenze (package.json)

```json
{
  "dependencies": {
    "express":         "^4.18.2",
    "express-session": "^1.17.3",
    "ejs":             "^3.1.9",
    "multer":          "^1.4.5-lts.1",
    "ws":              "^8.16.0"
  }
}
```

Installa tutto con:
```bash
npm install express@4.18.2 express-session ejs multer ws
```

> ⚠️ **Importante**: usa `express@4.18.2`, NON Express 5. La versione 5 ha una dipendenza
> da `path-to-regexp` incompatibile che causa crash all'avvio.

---

## 🗄️ Struttura dei file JSON

### data/users.json
```json
[
  {
    "id":       "18f3a2b4c",
    "username": "mike",
    "password": "1234",
    "joinedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

### data/posts.json
```json
[
  {
    "id":        1705312200000,
    "userId":    "18f3a2b4c",
    "username":  "mike",
    "text":      "Primo post!",
    "image":     "/uploads/1705312200000-123456789.jpg",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
]
```

### data/chat.json
```json
[
  {
    "id":        1705312200001,
    "username":  "mike",
    "testo":     "Ciao a tutti!",
    "timestamp": "2024-01-15T10:30:01.000Z"
  }
]
```

---

## 🚀 Implementazioni future — Roadmap

Di seguito le funzioni da aggiungere, in ordine di difficoltà.

---

### 🟢 Facile

#### F1 — Like ai post
**Descrizione:** bottone ❤️ su ogni post che incrementa un contatore.  
**File da modificare:** `server.js` (route `POST /like/:postId`), `home.ejs` (bottone + fetch JS)  
**Struttura dati:** aggiungere campo `likes: []` (array di username) in ogni post  
**Codice server predisposto:** `// app.post('/like/:postId', ...)`

---

#### F2 — Cancella il proprio post
**Descrizione:** il creatore può eliminare i propri post.  
**File:** `server.js` (route `DELETE /post/:id`), `home.ejs` (bottone visibile solo per l'autore)

---

#### F3 — Cancella messaggi chat
**Descrizione:** già predisposta nel tuo vecchio server (tipo 4). Ri-implementare con il nuovo protocollo.  
**File:** `server.js` (caso `tipo === 3` nel WebSocket), `chat.ejs` (clic sulla propria bolla)

---

### 🟡 Medio

#### M1 — Profilo utente
**Descrizione:** ogni utente ha una pagina `/profile` con foto, bio, e i propri post.  
**File:** `server.js` (route GET/POST `/profile`), `views/profile.ejs` (nuova pagina)  
**Struttura dati:** aggiungere campi `bio`, `avatar`, `fullName` in `users.json`  
**Upload:** riusare `multer` con cartella `uploads/profiles/`

---

#### M2 — Commenti ai post
**Descrizione:** form sotto ogni post per lasciare un commento.  
**File:** `server.js` (route `POST /comment/:postId`, `GET /comments/:postId`), `home.ejs`  
**Struttura dati:** `data/comments.json` con campi `postId`, `username`, `text`, `createdAt`

---

#### M3 — Ricerca utenti
**Descrizione:** barra di ricerca nella navbar che restituisce utenti per username.  
**File:** `server.js` (route `GET /search?q=`), `navbar.ejs` (input + dropdown JS)  
**Logica:** `users.filter(u => u.username.includes(q))`

---

#### M4 — Follow/Unfollow
**Descrizione:** seguire altri utenti e vedere solo i loro post nel feed.  
**File:** `server.js` (route `POST /follow/:username`), nuovo file `data/follows.json`  
**Home:** filtrare i post per mostrare solo quelli degli utenti seguiti

---

### 🔴 Avanzato

#### A1 — Chat privata tra due utenti
**Descrizione:** messaggi 1:1 visibili solo ai due partecipanti.  
**Approccio WebSocket:** aggiungere campo `to` nel messaggio; il server invia solo ai due client  
**Struttura dati:** `data/messages.json` con `from`, `to`, `text`, `timestamp`  
**UI:** lista chat nella sidebar (come WhatsApp)

---

#### A2 — Password hashing con bcrypt
**Descrizione:** le password non devono mai essere salvate in chiaro.  
**Libreria:** `npm install bcrypt`  
**Logica:** alla registrazione `bcrypt.hash(password, 10)`, al login `bcrypt.compare(password, hash)`

---

#### A3 — Notifiche in tempo reale
**Descrizione:** notifica WebSocket quando qualcuno mette like o commenta un tuo post.  
**Approccio:** inviare evento WS al proprietario del post quando arriva un'interazione

---

#### A4 — Autenticazione con JWT (sostituisce le sessioni)
**Descrizione:** sistema di autenticazione stateless — utile se in futuro separi frontend e backend.  
**Libreria:** `npm install jsonwebtoken`  
**Vantaggio:** funziona anche con app mobile (es. Flutter, come il tuo Miguel&Music)

---

#### A5 — Database reale (SQLite o MongoDB)
**Descrizione:** i file JSON vanno bene per imparare, ma non reggono con tanti utenti.  
**Opzione facile:**  `npm install better-sqlite3` — database SQL in un unico file  
**Opzione scalabile:** MongoDB Atlas (cloud, free tier)

---

## 📐 Schema di comunicazione

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (client)                     │
│                                                         │
│  EJS renderizzato    JavaScript         WebSocket API   │
│  (HTML statico)      (fetch, DOM)       (ws://)         │
└────────┬───────────────┬───────────────────┬────────────┘
         │ HTTP GET       │ HTTP POST/fetch    │ WS frames
         ▼               ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│                   NODE.JS  server.js                    │
│                                                         │
│  Express (HTTP)                  ws.Server (WebSocket)  │
│  ├── GET /login                  └── onconnection       │
│  ├── POST /login  ─ session          ├── tipo 0 → auth  │
│  ├── GET /home    ─ legge JSON       ├── tipo 1 → msg   │
│  ├── POST /create-post ─ multer      └── broadcast      │
│  └── GET /chat    ─ storico                             │
└────────┬───────────────────────────────────────────────┘
         │ readJSON / writeJSON
         ▼
┌─────────────────────────────────────────────────────────┐
│               data/  (file system)                      │
│   users.json     posts.json     chat.json               │
└─────────────────────────────────────────────────────────┘
         ▼
┌─────────────────────────────────────────────────────────┐
│               uploads/  (immagini)                      │
│   1705312200000-123456789.jpg   …                       │
└─────────────────────────────────────────────────────────┘
```

---

*ErMike-SocialHub — progetto scolastico Node.js/WebSocket*
