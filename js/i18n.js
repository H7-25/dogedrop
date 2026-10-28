// English source strings are the keys and the fallback. No wallet data is translated.
(function () {
  const STORAGE_KEY = 'dogedrop.language.v1';
  const it = {
  "Dogecoin recovery phrase": "Frase di recupero Dogecoin",
  "Anyone with these words can spend the coins. Keep them offline.": "Chiunque abbia queste parole può spendere le monete. Conservale offline.",
  "This computer": "Questo computer",
  "this computer": "questo computer",
  "Request failed": "Richiesta non riuscita",
  "Not connected": "Non connesso",
  "Unknown request": "Richiesta sconosciuta",
  "The browser did not share the wallet. Open it in its own tab once, then come back and try again.": "Il browser non ha condiviso il wallet. Aprilo prima in una scheda separata, poi torna qui e riprova.",
  "Cancelled": "Annullato",
  "Use a password of at least 8 characters.": "Usa una password di almeno 8 caratteri.",
  "Those passwords do not match.": "Le password non corrispondono.",
  "The words do not match your written copy yet.": "Le parole non corrispondono ancora alla tua copia scritta.",
  "This browser now has your wallet.": "Il wallet è ora disponibile in questo browser.",
  "This browser now has your wallet. Keep the 12 words somewhere safe.": "Il wallet è ora disponibile in questo browser. Conserva le 12 parole in un luogo sicuro.",
  "Choose the backup file.": "Scegli il file di backup.",
  "Those words are not a valid recovery phrase.": "Queste parole non sono una frase di recupero valida.",
  "Wallet restored on this browser.": "Wallet ripristinato in questo browser.",
  "Choose Dogecoin or DogecoinVM. The same address is not the same coins.": "Scegli Dogecoin o DogecoinVM. Lo stesso indirizzo non corrisponde alle stesse monete.",
  "Payment sent.": "Pagamento inviato.",
  "Enter the wallet password.": "Inserisci la password del wallet.",
  "Continue in your other wallet. DogeDrop did not send this payment.": "Continua nell'altro wallet. DogeDrop non ha inviato questo pagamento.",
  "Copied": "Copiato",
  "Settings saved on this browser.": "Impostazioni salvate in questo browser.",
  "Checking…": "Verifica in corso…",
  "Type the current receive address to remove the wallet from this browser.": "Digita l'indirizzo di ricezione attuale per rimuovere il wallet da questo browser.",
  "The wallet was removed from this browser. The coins are still safe if you kept the 12 words.": "Il wallet è stato rimosso da questo browser. Le monete sono ancora al sicuro se hai conservato le 12 parole.",
  "Activity could not be refreshed. Showing the last saved payments. The balance is current.": "Impossibile aggiornare l'attività. Sono mostrati gli ultimi pagamenti salvati. Il saldo è aggiornato.",
  "Dogecoin address": "Indirizzo Dogecoin",
  "Copy address": "Copia indirizzo",
  "This site is hosting the wallet itself, so its scripts can reach the wallet. For a real integration, load the wallet from its own address.": "Questo sito ospita direttamente il wallet, quindi i suoi script possono accedervi. Per un'integrazione reale, carica il wallet dal suo indirizzo separato.",
  "Refresh": "Aggiorna",
  "Lock": "Blocca",
  "Unlock": "Sblocca",
  "Close": "Chiudi",
  "New": "Nuovo",
  "Locked": "Bloccato",
  "Connected": "Connesso",
  "Unlocked": "Sbloccato",
  "Home": "Home",
  "Send": "Invia",
  "Receive": "Ricevi",
  "Activity": "Attività",
  "Settings": "Impostazioni",
  "Wallet": "Wallet",
  "Read this first": "Leggi prima questo",
  "DogeDrop has not been audited. Be careful. Test with a small amount only. A payment cannot be undone, and coins can be lost if something goes wrong.": "DogeDrop non è stato sottoposto a un audit. Fai attenzione. Prova solo con un piccolo importo. Un pagamento non può essere annullato e le monete possono andare perse se qualcosa va storto.",
  "I understand": "Ho capito",
  "Use the same wallet here": "Usa qui lo stesso wallet",
  "Use my wallet here": "Usa qui il mio wallet",
  "Browsers keep an embedded wallet separate until you allow it. Allowing it lets this page open the wallet you already created, instead of making a new one.": "I browser mantengono separato il wallet incorporato finché non dai il consenso. Il consenso permette a questa pagina di aprire il wallet che hai già creato, invece di crearne uno nuovo.",
  "Open the wallet in its own tab": "Apri il wallet in una scheda separata",
  "if the browser asks you to visit it first.": "se il browser ti chiede di visitarlo prima.",
  "DogeDrop stays with you": "DogeDrop resta con te",
  "Create a new wallet": "Crea un nuovo wallet",
  "I already have a wallet": "Ho già un wallet",
  "Coins are created and kept in this browser. The same 12 words also work on DogecoinVM. The coins on each chain stay separate. The website you are visiting never receives the keys.": "Le monete vengono create e conservate in questo browser. Le stesse 12 parole funzionano anche su DogecoinVM. Le monete di ogni rete restano separate. Il sito che stai visitando non riceve mai le chiavi.",
  "Choose a password": "Scegli una password",
  "Back": "Indietro",
  "This password locks the wallet on this browser. It is not sent anywhere. The 12 words, which come next, are what can restore the coins on another computer.": "Questa password blocca il wallet in questo browser. Non viene inviata da nessuna parte. Le 12 parole, mostrate nel prossimo passaggio, permettono di recuperare le monete su un altro computer.",
  "Password": "Password",
  "Password again": "Ripeti la password",
  "Extra word, optional": "Parola aggiuntiva, facoltativa",
  "Leave this empty unless you already use a BIP39 passphrase.": "Lascia vuoto questo campo, a meno che tu non usi già una passphrase BIP39.",
  "Show my 12 words": "Mostra le mie 12 parole",
  "Write down these 12 words": "Scrivi queste 12 parole",
  "Copy words": "Copia parole",
  "Download": "Scarica",
  "I wrote them down": "Le ho scritte",
  "This is the only backup. If you lose the words, the coins cannot be recovered by anyone. The next step asks for three of them.": "Questo è l'unico backup. Se perdi le parole, nessuno può recuperare le monete. Nel prossimo passaggio ti verranno chieste tre di queste parole.",
  "Check the backup": "Verifica il backup",
  "I understand nobody, including this website, can restore the words for me.": "Ho capito che nessuno, compreso questo sito, può recuperare le parole per me.",
  "Save wallet on this browser": "Salva il wallet in questo browser",
  "Words": "Parole",
  "Private key": "Chiave privata",
  "12 or 24 word phrase": "Frase di 12 o 24 parole",
  "12 or 24 words": "12 o 24 parole",
  "Starts with Q": "Inizia con Q",
  "File": "File",
  "Encrypted backup": "Backup cifrato",
  "Only if you created the phrase with a passphrase.": "Solo se hai creato la frase con una passphrase.",
  "Restore a wallet": "Ripristina un wallet",
  "How to restore": "Metodo di ripristino",
  "Password for this browser": "Password per questo browser",
  "Restore": "Ripristina",
  "DogecoinVM is a Dogecoin-compatible chain. It uses the same address, and the coins are separate. Choose it above, or pay with a dogecoinvm: link. A payment is final in about a fifth of a second.": "DogecoinVM è una rete compatibile con Dogecoin. Usa lo stesso indirizzo e le monete sono separate. Selezionala qui sopra oppure paga con un link dogecoinvm:. Un pagamento è definitivo in circa un quinto di secondo.",
  "What it is and how to use it": "Cos'è e come si usa",
  "Checking the network…": "Verifica della rete in corso…",
  " · last saved copy": " · ultima copia salvata",
  "Keys stay in this browser.": "Le chiavi restano in questo browser.",
  "Slow": "Lenta",
  "Normal": "Normale",
  "Fast": "Veloce",
  "This payment link already chooses the chain. It will not be paid on the other chain.": "Questo link di pagamento specifica già la rete. Il pagamento non avverrà sull'altra rete.",
  "A bare address can be paid on either chain. A dogecoin: or dogecoinvm: link chooses for you. Amount example: dogecoin:D...?amount=1.5": "Un semplice indirizzo può ricevere pagamenti su entrambe le reti. Un link dogecoin: o dogecoinvm: sceglie per te. Esempio di importo: dogecoin:D...?amount=1.5",
  "To": "Destinatario",
  "Amount": "Importo",
  "Send all": "Invia tutto",
  "Review": "Rivedi",
  "Chain": "Rete",
  "Confirm payment": "Conferma pagamento",
  "The leftover is small, so it is added to the fee. No change address is used.": "Il resto è piccolo, quindi viene aggiunto alla commissione. Non viene usato un indirizzo per il resto.",
  "Wallet password": "Password del wallet",
  "Sending…": "Invio in corso…",
  "Send now": "Invia ora",
  "Network fee": "Commissione di rete",
  "A node can find coins to spend, but it does not keep an address history.": "Un nodo può trovare monete da spendere, ma non conserva la cronologia degli indirizzi.",
  "No payments found for this wallet yet.": "Non sono ancora stati trovati pagamenti per questo wallet.",
  "Watched": "Monitorato",
  "Which chain to configure": "Rete da configurare",
  "Same as above": "Come sopra",
  "Public explorers": "Explorer pubblici",
  "BlockCypher token, optional": "Token BlockCypher, facoltativo",
  "SoChain API key": "Chiave API SoChain",
  "Dogecoin Core URL": "URL Dogecoin Core",
  "DogeGo URL": "URL DogeGo",
  "MemeTracker URL": "URL MemeTracker",
  "RPC user": "Utente RPC",
  "RPC password": "Password RPC",
  "Where to look up coins": "Dove cercare le monete",
  "Where to send the signed payment": "Dove inviare il pagamento firmato",
  "Custom": "Personalizzato",
  "Explorer address": "Indirizzo dell'explorer",
  "Same as the explorer": "Come l'explorer",
  "Send address": "Indirizzo di invio",
  "Coins are looked up and the signed payment is sent through vm.dogedrop.org unless you choose a custom address. The keys are not sent there.": "La ricerca delle monete e l'invio del pagamento firmato passano da vm.dogedrop.org, a meno che tu non scelga un indirizzo personalizzato. Le chiavi non vengono inviate lì.",
  "Connection": "Connessione",
  "Test connection": "Verifica connessione",
  "Download encrypted backup": "Scarica backup cifrato",
  "Show recovery phrase": "Mostra frase di recupero",
  "Remove from this browser": "Rimuovi da questo browser",
  "Lock after": "Blocca dopo",
  "5 minutes": "5 minuti",
  "15 minutes": "15 minuti",
  "1 hour": "1 ora",
  "When I close this page": "Quando chiudo questa pagina",
  "Save": "Salva",
  "Removing the wallet from this browser does not move the coins. Type the receive address to confirm.": "Rimuovere il wallet da questo browser non sposta le monete. Digita l'indirizzo di ricezione per confermare.",
  "A node password is stored only in this browser and is sent only to the node address above. The recovery phrase is never sent.": "La password del nodo è conservata solo in questo browser e inviata solo all'indirizzo del nodo indicato sopra. La frase di recupero non viene mai inviata.",
  "Recovery phrase": "Frase di recupero",
  "Extra word:": "Parola aggiuntiva:",
  "Hide": "Nascondi",
  "Sign a message": "Firma un messaggio",
  "Cancel": "Annulla",
  "Sign": "Firma",
  "Connect": "Connetti",
  "Choose a chain in the payment link": "Scegli una rete nel link di pagamento",
  "Unlock this wallet and continue": "Sblocca questo wallet e continua",
  "Creating or importing replaces the wallet in this browser. The coins stay safe only if you kept the 12 words.": "La creazione o l'importazione sostituisce il wallet in questo browser. Le monete restano al sicuro solo se hai conservato le 12 parole.",
  "This browser does not have a DogeDrop wallet yet.": "Questo browser non ha ancora un wallet DogeDrop.",
  "This opens a dogecoinvm: link for a wallet already installed on this device. DogeDrop does not sign that payment.": "Questo apre un link dogecoinvm: per un wallet già installato su questo dispositivo. DogeDrop non firma quel pagamento.",
  "This opens a dogecoin: link for a wallet already installed on this device. DogeDrop does not sign that payment.": "Questo apre un link dogecoin: per un wallet già installato su questo dispositivo. DogeDrop non firma quel pagamento.",
  "Choose how to pay": "Scegli come pagare",
  "Import a wallet": "Importa un wallet",
  "Pay with another wallet": "Paga con un altro wallet",
  "Free Dogechain API at dogechain.com, no key. Balance, activity and unspent coins come from there. Signed payments go out through a public explorer, because Dogechain does not broadcast.": "API Dogechain gratuita su dogechain.com, senza chiave. Saldo, attività e monete non spese provengono da lì. I pagamenti firmati vengono inviati tramite un explorer pubblico, perché Dogechain non trasmette transazioni.",
  "Dogechain for history, Blockchair for coins and sending. No account.": "Dogechain per la cronologia, Blockchair per le monete e l'invio. Nessun account.",
  "Free BlockCypher Dogecoin API. An optional token raises the limit.": "API Dogecoin gratuita di BlockCypher. Un token facoltativo aumenta il limite.",
  "SoChain finds coins. An API key is required. Sending still uses a public explorer unless you pick a node.": "SoChain trova le monete. Serve una chiave API. L'invio usa comunque un explorer pubblico, a meno che tu non scelga un nodo.",
  "Your node, through JSON-RPC. Keys stay in the browser. The node only sees addresses and the signed transaction.": "Il tuo nodo, tramite JSON-RPC. Le chiavi restano nel browser. Il nodo vede solo gli indirizzi e la transazione firmata.",
  "A DogeGo node, through the same JSON-RPC methods as Dogecoin Core.": "Un nodo DogeGo, tramite gli stessi metodi JSON-RPC di Dogecoin Core.",
  "Your MemeTracker node. It lists coins for addresses it is watching, through /getUTXOs. The recovery phrase stays in this browser.": "Il tuo nodo MemeTracker. Elenca le monete degli indirizzi che monitora, tramite /getUTXOs. La frase di recupero resta in questo browser.",
  "Activity could not be loaded.": "Impossibile caricare l'attività.",
  "A second explorer disagreed about a coin that would be spent. Nothing was sent.": "Un secondo explorer ha restituito dati diversi su una moneta da spendere. Non è stato inviato nulla.",
  "Could not double-check a coin before signing. Nothing was sent.": "Impossibile verificare una moneta con una seconda fonte prima della firma. Non è stato inviato nulla.",
  "MemeTracker answered.": "MemeTracker ha risposto.",
  "SoChain needs an API key.": "SoChain richiede una chiave API.",
  "SoChain answered.": "SoChain ha risposto.",
  "BlockCypher answered.": "BlockCypher ha risposto.",
  "Dogechain answered.": "Dogechain ha risposto.",
  "Dogechain and Blockchair answered.": "Dogechain e Blockchair hanno risposto.",
  "Add a SoChain API key in settings.": "Aggiungi una chiave API SoChain nelle impostazioni.",
  "The node could not scan coins. Try again in a moment.": "Il nodo non ha potuto cercare le monete. Riprova tra poco.",
  "Dogechain could not read that address.": "Dogechain non ha potuto leggere quell'indirizzo.",
  "Dogechain could not read a transaction.": "Dogechain non ha potuto leggere una transazione.",
  "Dogechain reported a balance, but not every unspent coin was listed. Try again in a moment.": "Dogechain ha segnalato un saldo, ma non ha elencato tutte le monete non spese. Riprova tra poco.",
  "The network did not accept the transaction.": "La rete non ha accettato la transazione.",
  "MemeTracker did not accept the payment. In Settings, send it through Public explorers, Dogecoin Core, or DogeGo.": "MemeTracker non ha accettato il pagamento. Nelle impostazioni, invialo tramite Explorer pubblici, Dogecoin Core o DogeGo.",
  "The node did not return a transaction id.": "Il nodo non ha restituito un ID della transazione.",
  "Enter the node address in settings.": "Inserisci l'indirizzo del nodo nelle impostazioni.",
  "The browser could not reach that node. It needs HTTPS and a CORS header that allows this page. An https wallet cannot call http://127.0.0.1.": "Il browser non ha potuto raggiungere quel nodo. Servono HTTPS e un'intestazione CORS che autorizzi questa pagina. Un wallet https non può chiamare http://127.0.0.1.",
  "The node returned an error.": "Il nodo ha restituito un errore.",
  "Request failed.": "Richiesta non riuscita.",
  "The network took too long to answer.": "La rete ha impiegato troppo tempo a rispondere.",
  "The browser could not reach MemeTracker. It needs HTTPS and a CORS header that allows this page. An https wallet cannot call http://127.0.0.1.": "Il browser non ha potuto raggiungere MemeTracker. Servono HTTPS e un'intestazione CORS che autorizzi questa pagina. Un wallet https non può chiamare http://127.0.0.1.",
  "Enter the MemeTracker address, starting with https://": "Inserisci l'indirizzo di MemeTracker, iniziando con https://",
  "DogecoinVM send address": "Indirizzo di invio DogecoinVM",
  "DogecoinVM explorer": "Explorer DogecoinVM",
  "The DogecoinVM explorer returned an amount this wallet cannot read.": "L'explorer DogecoinVM ha restituito un importo che questo wallet non può leggere.",
  "DogecoinVM did not return activity.": "DogecoinVM non ha restituito l'attività.",
  "The DogecoinVM send address did not accept the payment.": "L'indirizzo di invio DogecoinVM non ha accettato il pagamento.",
  "Enter a Dogecoin address that starts with D.": "Inserisci un indirizzo Dogecoin che inizi con D.",
  "Enter a DOGE amount like 12.5": "Inserisci un importo in DOGE come 12.5",
  "Enter an amount greater than zero.": "Inserisci un importo maggiore di zero.",
  "Not enough coins for that amount and fee.": "Le monete non bastano per questo importo e la commissione.",
  "This wallet has no coins to spend yet.": "Questo wallet non ha ancora monete da spendere.",
  "The balance is smaller than the network fee.": "Il saldo è inferiore alla commissione di rete.",
  "A payment output must be greater than zero.": "Un output di pagamento deve essere maggiore di zero.",
  "Missing the key for an input.": "Manca la chiave per un input.",
  "Could not sign one of the coins.": "Impossibile firmare una delle monete.",
  "Enter your password.": "Inserisci la password.",
  "This backup file is not a wallet this app understands.": "Questo file di backup non è un wallet riconosciuto da questa app.",
  "Wrong password, or the wallet file is damaged.": "Password errata oppure file del wallet danneggiato.",
  "Enter an address or a payment link.": "Inserisci un indirizzo o un link di pagamento.",
  "Use a dogecoin: or dogecoinvm: payment link.": "Usa un link di pagamento dogecoin: o dogecoinvm:.",
  "A payment link does not use //. The form is dogecoin:D... or dogecoinvm:D...": "Un link di pagamento non usa //. Il formato è dogecoin:D... o dogecoinvm:D...",
  "That payment link is not valid.": "Quel link di pagamento non è valido.",
  "That payment link does not contain a Dogecoin address.": "Quel link di pagamento non contiene un indirizzo Dogecoin.",
  "The amount in the payment link must look like 1.5": "L'importo nel link di pagamento deve avere un formato come 1.5",
  "This wallet does not understand a required part of that payment link.": "Questo wallet non riconosce una parte obbligatoria di quel link di pagamento.",
  "Message is too long to sign.": "Il messaggio è troppo lungo per essere firmato.",
  "The wallet took too long to answer.": "Il wallet ha impiegato troppo tempo a rispondere.",
  "Language": "Lingua",
  "Please fill out this field.": "Compila questo campo.",
  "Please select a file.": "Seleziona un file.",
  "Please check this box to continue.": "Seleziona questa casella per continuare.",
  "Please select an item in the list.": "Seleziona una voce dall'elenco.",
  "The value is too short. Use at least {min} characters.": "Il valore è troppo corto. Usa almeno {min} caratteri.",
  "Please enter a valid value.": "Inserisci un valore valido.",
  "A DogecoinVM payment is final in about a fifth of a second.": "Un pagamento DogecoinVM è definitivo in circa un quinto di secondo.",
  "A Dogecoin confirmation usually takes 1 to 10 minutes.": "Una conferma Dogecoin richiede solitamente da 1 a 10 minuti.",
  "{host} is waiting for a wallet.": "{host} è in attesa di un wallet.",
  "Word {number}": "Parola {number}",
  "Send on {chain}": "Invia su {chain}",
  "The QR is a payment link for {chain}. The address you copy is only the address. It is the same on both chains, and copying it does not choose a chain. The keys stay in this browser.": "Il codice QR è un link di pagamento per {chain}. L'indirizzo che copi è solo l'indirizzo. È uguale su entrambe le reti e copiarlo non seleziona una rete. Le chiavi restano in questo browser.",
  "Leftover": "Il resto di",
  "goes to a new address on {chain}.": "viene inviato a un nuovo indirizzo su {chain}.",
  "Signed in this browser, then sent through {provider}.": "Firmato in questo browser, poi inviato tramite {provider}.",
  "The QR is a {scheme} link, so a scan pays {chain}.": "Il codice QR è un link {scheme}, quindi una scansione paga su {chain}.",
  "The address below is only the address. After it receives a payment, the next one appears here.": "L'indirizzo qui sotto è solo l'indirizzo. Dopo che riceve un pagamento, qui compare il successivo.",
  "{host} wants a signature from your wallet. This does not spend coins.": "{host} richiede una firma dal tuo wallet. Questa operazione non spende monete.",
  "{host} wants to see your Dogecoin address and ask before each payment. It cannot see your recovery phrase.": "{host} vuole vedere il tuo indirizzo Dogecoin e chiedere il consenso prima di ogni pagamento. Non può vedere la tua frase di recupero.",
  "{host} is asking for a payment, and DogeDrop is not connected.": "{host} richiede un pagamento e DogeDrop non è connesso.",
  "The network did not answer ({error}). Showing the last saved balance and activity.": "La rete non ha risposto ({error}). Sono mostrati l'ultimo saldo e l'ultima attività salvati.",
  "{provider} answered. Block height {height}.": "{provider} ha risposto. Altezza del blocco {height}.",
  "MemeTracker answered. Chain tip {height}.": "MemeTracker ha risposto. Ultimo blocco {height}.",
  "Enter a {name}.": "Inserisci un valore per {name}.",
  "The {name} must start with http:// or https://.": "Il valore di {name} deve iniziare con http:// o https://.",
  "The browser could not read the DogecoinVM {which}. It needs HTTPS and a CORS header that allows this page. Host your own, or change it in Settings.": "Il browser non ha potuto leggere la risorsa DogecoinVM ({which}). Servono HTTPS e un'intestazione CORS che autorizzi questa pagina. Ospita una tua istanza oppure cambiala nelle impostazioni.",
  "DogecoinVM {name} answered{network}.": "La risorsa DogecoinVM ({name}) ha risposto{network}.",
  "explorer": "explorer",
  "send address": "indirizzo di invio",
  "Request failed ({status})": "Richiesta non riuscita ({status})",
  "An error occurred: {detail}": "Si è verificato un errore: {detail}"
};
  const supported = (value) => /^(en|it)$/i.test(String(value || ''));
  function detect() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (supported(saved)) return saved.toLowerCase();
    } catch { /* Embedded/private browsing may deny storage. */ }
    const preferences = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const preference of preferences) {
      const base = String(preference || '').toLowerCase().split(/[-_]/)[0];
      if (supported(base)) return base;
    }
    return 'en';
  }
  let language = detect();
  function t(key, params = {}) {
    const source = String(key ?? '');
    const translated = language === 'it' && Object.hasOwn(it, source) ? it[source] : source;
    return translated.replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(params, name) ? String(params[name]) : token);
  }
  function setLanguage(value) {
    language = supported(value) ? value.toLowerCase() : 'en';
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Keep the choice for this visit. */ }
    document.documentElement.lang = language;
    window.dispatchEvent(new Event('dogedrop:language'));
  }

  // Translate known diagnostics at the presentation boundary, leaving provider,
  // cryptographic and public integration errors untouched.
  const patterns = [
    [/^The network did not answer \(([\s\S]*)\)\. Showing the last saved balance and activity\.$/, 'The network did not answer ({error}). Showing the last saved balance and activity.', ['error']],
    [/^(Dogecoin Core|DogeGo|Dogechain) answered\. Block height ([\d,]+)\.$/, '{provider} answered. Block height {height}.', ['provider', 'height']],
    [/^MemeTracker answered\. Chain tip ([\d,]+)\.$/, 'MemeTracker answered. Chain tip {height}.', ['height']],
    [/^Enter a (DogecoinVM send address|DogecoinVM explorer)\.$/, 'Enter a {name}.', ['name']],
    [/^The (DogecoinVM send address|DogecoinVM explorer) must start with http:\/\/ or https:\/\/\.$/, 'The {name} must start with http:// or https://.', ['name']],
    [/^The browser could not read the DogecoinVM (send address|explorer)\. It needs HTTPS and a CORS header that allows this page\. Host your own, or change it in Settings\.$/, 'The browser could not read the DogecoinVM {which}. It needs HTTPS and a CORS header that allows this page. Host your own, or change it in Settings.', ['which']],
    [/^DogecoinVM (send address|explorer) answered( \([^\n]*?\))?\.$/, 'DogecoinVM {name} answered{network}.', ['name', 'network']],
    [/^Request failed \((\d+)\)$/, 'Request failed ({status})', ['status']],
  ];
  function message(value) {
    const source = String(value ?? '');
    if (!source || language === 'en') return source;
    if (Object.hasOwn(it, source)) return t(source);
    for (const [pattern, key, names] of patterns) {
      const match = source.match(pattern);
      if (match) return t(key, Object.fromEntries(names.map((name, index) => [name,
        name === 'error' ? message(match[index + 1]) : t(match[index + 1] || '')])));
    }
    // Connection tests join whole diagnostics, which may contain several sentences.
    // Match complete known messages rather than splitting their internal sentences.
    for (const key of Object.keys(it).sort((a, b) => b.length - a.length)) {
      if (key.endsWith('.') && source.startsWith(key + ' ')) {
        return t(key) + ' ' + message(source.slice(key.length + 1));
      }
    }
    for (const [pattern] of patterns) {
      const prefix = source.match(new RegExp(pattern.source.slice(0, -1) + '(?= )'));
      if (prefix) return message(prefix[0]) + ' ' + message(source.slice(prefix[0].length + 1));
    }
    // Unknown browser/library/server errors remain available as technical detail.
    return t('An error occurred: {detail}', { detail: source });
  }

  function localizeValidation(root) {
    for (const field of root.querySelectorAll('input, textarea, select')) {
      const update = () => {
        field.setCustomValidity('');
        const validity = field.validity;
        let key = '';
        if (validity.valueMissing) {
          key = field.type === 'checkbox' ? 'Please check this box to continue.'
            : field.type === 'file' ? 'Please select a file.'
              : field.tagName === 'SELECT' ? 'Please select an item in the list.' : 'Please fill out this field.';
        } else if (validity.tooShort) key = 'The value is too short. Use at least {min} characters.';
        else if (!validity.valid) key = 'Please enter a valid value.';
        if (key) field.setCustomValidity(t(key, { min: field.minLength }));
      };
      field.addEventListener('input', update);
      field.addEventListener('change', update);
      field.addEventListener('invalid', update);
      update();
    }
  }
  function restoreLanguage() {
    language = detect();
    document.documentElement.lang = language;
  }
  document.documentElement.lang = language;
  window.DogeI18n = { t, message, setLanguage, restoreLanguage, localizeValidation, get language() { return language; } };
})();
