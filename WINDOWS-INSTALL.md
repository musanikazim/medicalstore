# Sehat on Windows 11 — start here

**Already installed at `F:\Sehat-MedicalStore`? Use [docs/UPDATE-WINDOWS.md](docs/UPDATE-WINDOWS.md), not first-time setup.**

This package contains the complete project source. It does not contain the Codex database, administrator account, passwords, or private settings. Your Windows installation starts with its own database and new credentials. Nothing is uploaded or publicly deployed.

## 1. Install Docker Desktop once

1. Download **Docker Desktop for Windows** from https://www.docker.com/products/docker-desktop/ . Check Docker's current system requirements and licence terms.
2. During installation use the **WSL 2** option. Restart Windows if requested. If Windows asks to enable virtualization or install/update WSL, follow Docker Desktop's instructions.
3. Start Docker Desktop. Wait until it says the Docker engine is running. Use **Linux containers** (the default).

You do **not** need to install Node.js, PostgreSQL, Git, npm or programming tools on Windows. Internet access is needed for the first download/build. Later starts use the already-built image. Docker Desktop must stay running while you use Sehat.

## 2. Extract the ZIP

1. Right-click `Sehat-MedicalStore-Complete.zip` → **Properties**. If there is an **Unblock** checkbox, tick it and click Apply.
2. Right-click the ZIP → **Extract All**. Do not run files inside the compressed ZIP.
3. Move the extracted `Sehat-MedicalStore` folder to a local folder such as `C:\Sehat-MedicalStore`. Avoid OneDrive, a network drive, and Program Files.
4. Open that folder. You should see `Setup-Windows.cmd`, `Start-Sehat.cmd` and this guide.

## 3. First setup — double-click one file

Double-click **`Setup-Windows.cmd`**. It will:

- Check that Docker Desktop is running.
- Generate new random local database/session secrets in a private `.env` file. It does not use the Codex credentials.
- Download/build the app and PostgreSQL. Allow about 10–20 minutes on the first run; the time depends on your internet connection and computer.
- Initialize the database without deleting existing records.
- Ask whether to include sample medicines for practice. Type **Y** for samples, or press Enter for a clean store. Sample prices are illustrative.
- Ask you to choose an administrator email and password. Your email is a local login name; no email is sent. Use at least 12 characters. Password typing is hidden, so the screen may appear blank while you type. Confirm the password when asked.
- Start the application and open your browser.

Go to **http://localhost:3001** and sign in with the email/password **you chose**. Save them in your password manager. The administrator password is not saved in a text file. The `.env` file holds only installation secrets and must stay with this installation.

If a script window says it failed, read the message before pressing a key to close it. Fix the stated issue and run setup again. Setup preserves existing data and secrets. Creating an existing account never changes its password.

## Everyday use

| What you want                                                         | Double-click               |
| --------------------------------------------------------------------- | -------------------------- |
| Start Sehat and open the browser                                      | `Start-Sehat.cmd`          |
| Stop Sehat, keeping all records                                       | `Stop-Sehat.cmd`           |
| Make a manual database backup                                         | `Backup-Database.cmd`      |
| Create another administrator                                          | `Create-Administrator.cmd` |
| Apply database initialization/migrations again, without deleting data | `Initialize-Database.cmd`  |

Closing the browser does not stop Sehat. Use Stop-Sehat when you are finished. After restarting Windows, start Docker Desktop and then use Start-Sehat.

Do not delete the project folder's `.env` file or change its database password after setup. Do not click Docker Desktop's **Delete volume**, **Clean/Purge data**, or **Factory reset** unless you have verified backups and intend to remove the database. Do not run `docker compose down --volumes`.

## Your records and backups

The database lives in Docker's persistent named volume **`sehat-medicalstore_medicalstore-data`**. Stopping/restarting the app does not erase it. Copying the source folder alone does **not** copy the database.

**Manual backup:** double-click Backup-Database. A timestamped `.dump` file appears in the project's **backups** folder. The script copies the binary file correctly even with Windows PowerShell 5.1. Keep a separate secure copy on another drive. A database backup includes store/user records (including password hashes), invoices and inventory; treat it as private.

**Automatic backup:** a separate local backup container checks the clock every minute and saves a backup during **02:00–03:00 Pakistan time** once per day. The computer, Docker Desktop and the Sehat containers must be running during that hour. It retries failures during that hour. It does not back up while the computer is off. Backups are retained until you remove them; watch available disk space.

For recovery or moving to another computer, keep both a recent `.dump` and a private copy of `.env`. Recovery should first be tested into a new empty database; see `docs/DEPLOYMENT.md`. Ask for help before restoring over a live store. Do not open or edit `.dump` files in Notepad.

## Privacy and local access

Only the app's port **3001** is bound to **127.0.0.1** on your computer. PostgreSQL has **no published host port**. The URL is for your own Windows computer, not the internet or other computers. No public tunnel, cloud hosting, firewall opening or router forwarding is needed.

The Compose app runs the built UI/API in local HTTP mode so sign-in cookies work on `http://localhost:3001`. Do not change it to production/Secure-cookie mode without setting up HTTPS. For this local-only setup, HTTP over loopback is intentional.

## Troubleshooting

- **Docker not running / pipe error:** start Docker Desktop, wait for the engine, then retry.
- **WSL or virtualization error:** follow Docker Desktop's Windows/WSL instructions; a restart may be necessary.
- **Port 3001 already in use:** close the other program using that port. This package is intended to use `http://localhost:3001`. Do not open the database port to fix it.
- **Downloads fail:** check internet access, free disk space and Docker Desktop's proxy settings. Do not disable certificate verification.
- **App takes time to open:** wait for startup to finish; refresh the browser. The initial build is much slower than everyday startup.
- **Sign-in fails:** use the administrator credentials you chose during setup. The Codex preview account is not included. Re-creating an existing account does not reset its password. Another administrator can change it in Settings → Users & access.
- **Lost `.env` but Docker data still exists:** restore your private copy. Setup deliberately refuses to generate a different password for an existing database volume.
- **PowerShell scripts blocked:** the included `.cmd` launchers set execution policy only for their own PowerShell process; they do not change your computer's global policy. An organization may still block scripts; ask its IT administrator rather than weakening company policy.

To collect local diagnostic messages, open PowerShell in the project folder and run `docker compose logs --tail=80 app db backup`. Logs are private; inspect them before sharing. Never share `.env` or run `docker compose config` in a public recording, because rendered configuration includes local secrets.

## Included PowerShell scripts

The `.cmd` launchers call scripts under `scripts\windows`. For example, experienced users can run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Setup.ps1
```

`Start.ps1 -NoBrowser` starts the application without opening a browser. Normal use requires no administrator PowerShell window. Re-running setup will not update an existing administrator password or delete records.

## Verification limits

The package is checked for excluded credentials and archive integrity. The Docker application/database workflow and automated application tests are verified in the Codex Linux environment. The PowerShell helpers, including the update script, passed syntax checks, and the setup helpers were exercised with PowerShell 7 on Linux against an isolated Docker stack. See `docs/WINDOWS-PACKAGE-VERIFICATION.md` for the checks performed. Windows 11, Docker Desktop/WSL installation, and your physical printer/scanner cannot be exercised on this Linux machine; follow the guide and report the exact error if your computer needs assistance. All existing application modules and business rules remain in the source package. See README.md for application scope and known dependency advisories.
