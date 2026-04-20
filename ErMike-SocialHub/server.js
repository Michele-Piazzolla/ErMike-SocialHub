// ============================================================
//  ErMike-SocialHub  —  server.js
//  Stack: Node.js · Express 4 · EJS · multer · ws
// ============================================================

// ── Moduli richiesti ──────────────────────────────────────
const express  = require('express');
const session  = require('express-session');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { Server, WebSocket } = require('ws');  // WebSocket serve per WebSocket.OPEN

const app  = express();
const PORT = 3000;

// ── Configurazione Express ────────────────────────────────
app.use(express.urlencoded({ extended: true }));   // legge form HTML
app.use(express.json());                            // legge JSON nelle richieste
app.use(express.static('public'));                  // file statici (css, img…)
app.use('/uploads', express.static('uploads'));     // rende accessibili le immagini caricate

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Sessioni ──────────────────────────────────────────────
// Le sessioni tengono traccia di chi è loggato tra una richiesta e l'altra.
// Il "secret" serve per firmare il cookie lato server.
app.use(session({
  secret:            'ermike-secret-2024',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false }   // false = funziona su HTTP locale
}));

// ── Multer: upload immagini post ─────────────────────────
// Multer intercetta i file inviati via form e li salva in uploads/
const postStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename:    (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage: postStorage });

// ── Multer: upload avatar profilo ────────────────────────
// Separato dal primo multer così le foto profilo vanno in uploads/profiles/
const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/profiles/'),
  filename:    (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const profileUpload = multer({ storage: profileStorage });

// ── File JSON (database locale) ───────────────────────────
// Usiamo semplici file JSON al posto di un database reale.
// Per progetti più grandi si userebbe MongoDB, PostgreSQL, ecc.
const FILES = {
  users:    './data/users.json',
  posts:    './data/posts.json',
  chat:     './data/chat.json',
  comments: './data/comments.json'    // ← aggiunto qui per coerenza con gli altri
};

// ── Crea cartelle e file se non esistono ─────────────────
// IMPORTANTE: 'uploads/profiles/' deve esistere PRIMA che multer ci scriva.
// Se non viene creata qui, l'upload dell'avatar genera un errore ENOENT.
if (!fs.existsSync('./data'))              fs.mkdirSync('./data');
if (!fs.existsSync('./uploads'))           fs.mkdirSync('./uploads');
if (!fs.existsSync('./uploads/profiles'))  fs.mkdirSync('./uploads/profiles');  // ← fix

Object.values(FILES).forEach(f => {
  if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
});

// ── Helper lettura/scrittura JSON ────────────────────────
const readJSON  = f      => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ── Migrazione dati: aggiunge campi mancanti ─────────────
// Garantisce compatibilità con utenti registrati prima che i campi
// bio/fullName/avatar venissero aggiunti al modello.
(function migrateUsers() {
  const users = readJSON(FILES.users);
  let changed = false;
  users.forEach(u => {
    if (!u.bio      && u.bio      !== '') { u.bio      = '';   changed = true; }
    if (!u.fullName && u.fullName !== '') { u.fullName = '';   changed = true; }
    if (u.avatar    === undefined)        { u.avatar   = null; changed = true; }
  });
  if (changed) writeJSON(FILES.users, users);
})();

// Aggiunge campo likes[] ai post creati prima che la funzione fosse implementata
(function migratePosts() {
  const posts = readJSON(FILES.posts);
  let changed = false;
  posts.forEach(p => { if (!p.likes) { p.likes = []; changed = true; } });
  if (changed) writeJSON(FILES.posts, posts);
})();

// ── Middleware protezione route ───────────────────────────
// Aggiunto come secondo argomento alle route che richiedono login
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// =============================================================
//  ROTTE — Autenticazione
// =============================================================

app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/home' : '/login');
});

// ── Login ─────────────────────────────────────────────────
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(FILES.users);
  const user  = users.find(u => u.username === username && u.password === password);

  if (user) {
    req.session.user = { id: user.id, username: user.username };
    return res.redirect('/home');
  }
  res.render('login', { error: 'Username o password errati.' });
});

// ── Registrazione ─────────────────────────────────────────
app.get('/register', (req, res) => res.render('register', { error: null }));

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.render('register', { error: 'Compila tutti i campi.' });

  const users = readJSON(FILES.users);
  if (users.find(u => u.username === username))
    return res.render('register', { error: 'Username già in uso.' });

  const newUser = {
    id:       Date.now().toString(16),   // ID univoco esadecimale, es. "18f3a2b4c"
    username,
    password,
    fullName: '',
    bio:      '',
    avatar:   null,
    joinedAt: new Date().toISOString()
  };
  users.push(newUser);
  writeJSON(FILES.users, users);

  req.session.user = { id: newUser.id, username: newUser.username };
  res.redirect('/home');
});

// ── Logout ────────────────────────────────────────────────
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// =============================================================
//  ROTTE — Profilo utente
// =============================================================

// Mostra il profilo dell'utente loggato
app.get('/profile', requireLogin, (req, res) => {
  const users = readJSON(FILES.users);
  const user  = users.find(u => u.username === req.session.user.username);
  const posts = readJSON(FILES.posts)
    .filter(p => p.username === req.session.user.username)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('profile', { user, posts });
});

// Salva le modifiche al profilo (nome, bio, avatar)
app.post('/profile/update', requireLogin, profileUpload.single('avatar'), (req, res) => {
  const { fullName, bio } = req.body;
  const users      = readJSON(FILES.users);
  const userIndex  = users.findIndex(u => u.username === req.session.user.username);

  if (userIndex !== -1) {
    users[userIndex].fullName = fullName || '';
    users[userIndex].bio      = bio      || '';
    // Aggiorna l'avatar solo se è stato caricato un nuovo file
    if (req.file) {
      users[userIndex].avatar = '/uploads/profiles/' + req.file.filename;
    }
    writeJSON(FILES.users, users);
  }
  res.redirect('/profile');
});

// =============================================================
//  ROTTE — Home & Post
// =============================================================

// Home: mostra tutti i post in ordine dal più recente
app.get('/home', requireLogin, (req, res) => {
  const posts = readJSON(FILES.posts)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('home', { user: req.session.user, posts });
});

// Pagina form crea post
app.get('/create-post', requireLogin, (req, res) => {
  res.render('createPost', { user: req.session.user, error: null });
});

// Salva il nuovo post (con eventuale immagine)
app.post('/create-post', requireLogin, upload.single('image'), (req, res) => {
  const { text } = req.body;
  if (!text && !req.file)
    return res.render('createPost', { user: req.session.user, error: 'Scrivi qualcosa o allega un\'immagine.' });

  const posts = readJSON(FILES.posts);
  posts.push({
    id:        Date.now(),
    userId:    req.session.user.id,
    username:  req.session.user.username,
    text:      text || '',
    image:     req.file ? '/uploads/' + req.file.filename : null,
    likes:     [],
    createdAt: new Date().toISOString()
  });
  writeJSON(FILES.posts, posts);
  res.redirect('/home');
});

// ── Like / Unlike ────────────────────────────────────────
// Restituisce JSON { likes: numero, liked: booleano }
// Il JS in home.ejs aggiorna il contatore senza ricaricare la pagina
app.post('/like/:postId', requireLogin, (req, res) => {
  const postId   = parseInt(req.params.postId);
  const username = req.session.user.username;
  const posts    = readJSON(FILES.posts);
  const post     = posts.find(p => p.id === postId);

  if (!post) return res.status(404).json({ error: 'Post non trovato' });

  if (post.likes.includes(username)) {
    post.likes = post.likes.filter(u => u !== username);  // rimuovi like
  } else {
    post.likes.push(username);                             // aggiungi like
  }

  writeJSON(FILES.posts, posts);
  // liked: verifica se username è ancora nell'array dopo la modifica
  res.json({ likes: post.likes.length, liked: post.likes.includes(username) });
});

// ── Commenti ─────────────────────────────────────────────
// Aggiunge un commento a un post
app.post('/comment/:postId', requireLogin, (req, res) => {
  const postId   = parseInt(req.params.postId);
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Testo vuoto' });

  const comments   = readJSON(FILES.comments);
  const newComment = {
    id:        Date.now(),
    postId,
    username:  req.session.user.username,
    text:      text.trim(),
    createdAt: new Date().toISOString()
  };
  comments.push(newComment);
  writeJSON(FILES.comments, comments);
  res.json(newComment);
});

// Restituisce i commenti di un post (ordinati dal meno al più recente)
app.get('/comments/:postId', requireLogin, (req, res) => {
  const postId   = parseInt(req.params.postId);
  const comments = readJSON(FILES.comments)
    .filter(c => c.postId === postId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(comments);
});

// ── Elimina post ─────────────────────────────────────────
// Solo l'autore può eliminare: il server lo verifica (non fidarsi solo del client)
app.delete('/post/:id', requireLogin, (req, res) => {
  const postId   = parseInt(req.params.id);
  const username = req.session.user.username;
  let   posts    = readJSON(FILES.posts);
  const post     = posts.find(p => p.id === postId);

  if (!post)                       return res.status(404).json({ error: 'Post non trovato' });
  if (post.username !== username)  return res.status(403).json({ error: 'Non autorizzato' });

  posts = posts.filter(p => p.id !== postId);
  writeJSON(FILES.posts, posts);
  res.json({ success: true });
});

// ── Ricerca utenti (usata dalla navbar) ──────────────────
// GET /search?q=testo → JSON array di utenti
// La navbar fa questa chiamata e mostra un dropdown con i risultati.
// Non restituisce la password degli utenti.
app.get('/search', requireLogin, (req, res) => {
  const q       = (req.query.q || '').toLowerCase().trim();
  const current = req.session.user.username;

  if (!q) return res.json([]);

  const users = readJSON(FILES.users);
  const results = users
    .filter(u =>
      u.username !== current &&  // esclude l'utente corrente dai risultati
      (
        u.username.toLowerCase().includes(q) ||
        (u.fullName || '').toLowerCase().includes(q)
      )
    )
    .slice(0, 6)  // massimo 6 risultati nel dropdown
    .map(u => ({
      username: u.username,
      fullName: u.fullName || '',
      avatar:   u.avatar || null
      // NON includere u.password!
    }));

  res.json(results);
});

// =============================================================
//  ROTTE — Chat
// =============================================================

app.get('/chat', requireLogin, (req, res) => {
  const history = readJSON(FILES.chat);
  res.render('chat', { user: req.session.user, history });
});

// =============================================================
//  AVVIO SERVER HTTP
//  Una sola chiamata a app.listen() — il WebSocket usa la stessa istanza
// =============================================================
const server = app.listen(PORT, () => {
  console.log(`ErMike-SocialHub attivo → http://localhost:${PORT}`);
});

// =============================================================
//  WEBSOCKET — Chat globale in tempo reale
// =============================================================
const wss       = new Server({ server });
const connessi  = new Map();          // ws → username
let   storico   = readJSON(FILES.chat); // storico in RAM per velocità

wss.on('connection', ws => {

  ws.on('message', raw => {
    let dati;
    try   { dati = JSON.parse(raw); }
    catch { return; }

    // TIPO 0 — autenticazione: il client manda il suo username
    if (dati.tipo === 0) {
      for (const [, u] of connessi) {
        if (u === dati.username) {
          ws.send(JSON.stringify({ tipo: -1, errore: 'Già connesso in un\'altra scheda.' }));
          return;
        }
      }
      connessi.set(ws, dati.username);
      // Invia lo storico dei messaggi precedenti al client appena connesso
      ws.send(JSON.stringify({ tipo: 1, storico }));
      return;
    }

    // TIPO 1 — nuovo messaggio: broadcast a tutti i client connessi
    if (dati.tipo === 1) {
      const username = connessi.get(ws);
      if (!username) return;

      const msg = {
        id:        Date.now(),
        username,
        testo:     dati.testo,
        timestamp: new Date().toISOString()
      };
      storico.push(msg);
      writeJSON(FILES.chat, storico);

      const pacchetto = JSON.stringify({ tipo: 2, msg });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(pacchetto);
      });
      return;
    }

    // ── [FUTURO] TIPO 3: cancella messaggio ──────────────────
    // if (dati.tipo === 3) {
    //   const username = connessi.get(ws);
    //   storico = storico.filter(m => !(m.id === dati.id && m.username === username));
    //   writeJSON(FILES.chat, storico);
    //   wss.clients.forEach(c => {
    //     if (c.readyState === WebSocket.OPEN)
    //       c.send(JSON.stringify({ tipo: 3, id: dati.id }));
    //   });
    // }
  });

  ws.on('close', () => connessi.delete(ws));
});

// =============================================================
//  IMPLEMENTAZIONI FUTURE (route HTTP)
// =============================================================

// -- FOLLOW / UNFOLLOW --
// app.post('/follow/:target',   requireLogin, (req, res) => { ... });
// app.post('/unfollow/:target', requireLogin, (req, res) => { ... });
// Richiede: data/follows.json con { follower, followed }

// -- PROFILO PUBBLICO di un altro utente --
// app.get('/profile/:username', requireLogin, (req, res) => { ... });
// Mostra il profilo di qualsiasi utente, non solo il proprio

// -- NOTIFICHE --
// app.get('/notifications', requireLogin, (req, res) => { ... });
// Richiede: data/notifications.json con { userId, type, fromUser, postId, read }

// -- CHAT PRIVATA TRA DUE UTENTI --
// app.get('/chat/private/:username', requireLogin, (req, res) => { ... });
// Richiede: data/messages.json con { from, to, text, timestamp }
// Il WebSocket dovrà inviare il messaggio SOLO ai due client coinvolti
