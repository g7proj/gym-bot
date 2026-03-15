# gym-bot

Automazione personale per la prenotazione dei corsi in palestra tramite API `inforyou.teamsystem.com`, scritta in Python.

## Requisiti

- Python 3.11+ installato e disponibile nel `PATH`
- Accesso al portale palestra (username e password validi)
- Connessione internet

## Setup ambiente locale (Windows / PowerShell)

Tutti i comandi sono da eseguire nella root del progetto, ad esempio:

```powershell
cd C:\projects\gym-bot
```

### 1. Creazione e attivazione virtualenv

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Se l’attivazione dello script è bloccata da policy di esecuzione, puoi temporaneamente abilitarla con:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

e poi riprovare ad attivare il virtualenv.

### 2. Installazione delle dipendenze

Con l’ambiente virtuale attivo:

```powershell
pip install -r requirements.txt
```

Questo installerà:

- `requests` per le chiamate HTTP verso l’API
- `python-dotenv` per caricare eventuali variabili da `.env`
- `PyYAML` (verrà usato più avanti per la configurazione corsi)

### 3. Configurazione credenziali e token

Lo script legge le credenziali e i token da variabili d’ambiente:

- `GYM_USERNAME` – username del portale
- `GYM_PASSWORD` – password del portale
- `GYM_APP_TOKEN` – opzionale; se non impostata viene usato un valore di default osservato dal portale

Per impostarle nella sessione corrente di PowerShell:

```powershell
$env:GYM_USERNAME = "il_tuo_username"
$env:GYM_PASSWORD = "la_tua_password"
```

`GYM_APP_TOKEN` ha già un **valore di default** integrato nel codice (`DEFAULT_APP_TOKEN` in `gym_bot/config.py`).  
Se vuoi sovrascriverlo (ad esempio se la palestra cambia token), puoi impostarlo così:

```powershell
$env:GYM_APP_TOKEN = "VALORE_APP_TOKEN_DAL_PORTALE"
```

In alternativa, puoi creare un file `.env` nella root del progetto con il seguente contenuto (usato solo in locale):

```env
GYM_USERNAME=il_tuo_username
GYM_PASSWORD=la_tua_password
# GYM_APP_TOKEN=VALORE_APP_TOKEN_DAL_PORTALE  # opzionale
```

`python-dotenv` verrà caricato automaticamente da `gym_bot.cli` (se installato).

## Esecuzione della CLI

Con il virtualenv attivo e le variabili d’ambiente impostate:

```powershell
cd C:\projects\gym-bot\src
python -m gym_bot.cli
```

Lo script esegue i seguenti passi:

1. Carica eventuali variabili da `.env`
2. Legge `GYM_USERNAME` e `GYM_PASSWORD`
3. Chiama l’endpoint di login del portale e ottiene il token
4. Chiama l’endpoint delle lezioni (`/webbooking/listwithmine`) per i prossimi 20 giorni (oggi incluso)
5. Applica i filtri definiti nel file `courses.yaml` in base al giorno della settimana e alle parole chiave dei corsi
6. Stampa a schermo le lezioni che rispettano le preferenze, con data, orario, descrizione e posti liberi

Se qualcosa va storto (es. credenziali mancanti o errate), il programma termina con un messaggio di errore e un exit code diverso da zero.

## Configurazione corsi (`courses.yaml`)

Per indicare i corsi che ti interessano in base al giorno della settimana, usa il file `courses.yaml` nella root del progetto.

Esempio:

```yaml
monday:
  - "yoga"
tuesday:
  - "weightlifting"
wednesday:
  - "weightlifting"
thursday:
  - "weightlifting"
friday:
  - "weightlifting"
saturday:
  - "yoga"
```

Note:

- I nomi dei giorni devono essere in inglese, minuscoli (`monday`, `tuesday`, …).
- Le stringhe nella lista sono parole chiave confrontate in modo case-insensitive con il campo `ServiceDescription` delle lezioni.
- Puoi indicare più corsi per lo stesso giorno (basta aggiungere più voci nella lista).

## Struttura dei moduli

La logica del progetto è suddivisa in:

- `gym_bot/client.py`: gestisce tutte le chiamate HTTP (login, elenco servizi, elenco lezioni, prenotazioni).
- `gym_bot/config.py`: valori di configurazione e lettura delle credenziali/token da variabili d’ambiente.
- `gym_bot/schedule.py`: funzioni per lavorare con le date/orari e per filtrare le lezioni in base alle preferenze settimanali.
- `gym_bot/courses_config.py`: lettura e normalizzazione del file `courses.yaml`.
- `gym_bot/cli.py`: entrypoint da terminale che orchestra le chiamate ai moduli precedenti e stampa l’output.

## Note di sicurezza

- **Non** committare mai le credenziali reali nel repository.
- Usa sempre variabili d’ambiente o un file `.env` non tracciato (già escluso da `.gitignore`).
