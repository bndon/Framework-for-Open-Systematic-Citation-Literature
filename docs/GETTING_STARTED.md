# Getting started: run FOSCL on your own computer

FOSCL is a desktop app. Nothing is installed from an app store: you download the source code from GitHub, and your computer builds and runs it. This takes about 30 to 60 minutes the first time, mostly waiting for downloads and the first build.

## 1. What to install first

You need four things. Install them in this order, then **restart your computer** (or at least close and reopen every terminal window) so they are found.

| Tool | What it is for | Where to get it |
|---|---|---|
| **Git** | downloads the code from GitHub | https://git-scm.com/downloads |
| **Node.js (LTS version)** | runs the interface part | https://nodejs.org (choose "LTS") |
| **Rust** | builds the desktop part | https://rustup.rs (run the installer, accept the defaults) |
| **Build tools for your system** | lets Rust compile | see below |

**Windows**

1. When the Rust installer asks about the **Microsoft C++ Build Tools**, say yes. Or install them yourself from https://visualstudio.microsoft.com/visual-cpp-build-tools/ and tick **"Desktop development with C++"**.
2. **WebView2** is also needed. It is already included in Windows 10 and 11.

**macOS**

1. Open Terminal and run `xcode-select --install`.

**Linux (Debian/Ubuntu)**

1. Run: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
2. Other distributions: see https://v2.tauri.app/start/prerequisites/

**Check that everything is installed.** Open a new terminal and run these. Each should print a version number:

```
git --version
node --version
npm --version
cargo --version
```

If one says "not recognized" or "command not found", that tool is not installed or the terminal was opened before installing it. Close the terminal, open a new one, and try again.

## 2. Get access to the code

The repository is at:

https://github.com/bndon/framework-for-open-systematic-citation-literature

If it is private, the owner must add your GitHub account as a **collaborator** (Settings → Collaborators), and you accept the invitation that GitHub emails you. You also need to be signed in to Git on your computer. The easiest way is to install **GitHub Desktop** or run `gh auth login` (GitHub CLI).

## 3. Download the code and open the right branch

The newest work is on the branch `claude/menu-graph-polish`. In a terminal:

```
git clone https://github.com/bndon/framework-for-open-systematic-citation-literature.git
cd framework-for-open-systematic-citation-literature
git fetch origin
git checkout -B claude/menu-graph-polish origin/claude/menu-graph-polish
```

Check that you have the latest version:

```
git log --oneline -1
```

It should show the most recent commit message (at the time of writing: "Lock Access Hub, Manuscript Analyzer and smart suggestions behind a Pro plan; honest Plans page").

## 4. Install and run

```
npm install
npm run tauri dev
```

- `npm install` downloads the interface libraries. Do it once, and again whenever `package.json` changes.
- `npm run tauri dev` builds and opens the app. **The first run takes several minutes** while Rust compiles everything. Later runs start in seconds. A window titled FOSCL opens.
- Leave the terminal open while you use the app. Press `Ctrl+C` in it to stop.

## 5. Make a normal installer (optional)

To get an installer you can double-click, or send to someone else:

```
npm run tauri build
```

The installer appears under `src-tauri/target/release/bundle/` (a `.msi` or `.exe` on Windows, a `.dmg` on macOS, `.deb` or `.AppImage` on Linux). This build takes longer than `tauri dev`.

## 6. Where your data lives

Everything you create is stored on your computer, not on a server.

- **Windows:** `%APPDATA%\com.anon.foscl\foscl\` (type that into the File Explorer address bar)
- **macOS:** `~/Library/Application Support/com.anon.foscl/foscl/`
- **Linux:** `~/.local/share/com.anon.foscl/foscl/`

A new install starts **empty**. To move your work between computers, use **Settings → Backup & restore** in the app: make a backup on one computer, copy the folder across, and restore it on the other.

## 7. Updating to a newer version later

```
git fetch origin
git checkout claude/menu-graph-polish
git pull
npm install
npm run tauri dev
```

If Git complains about local changes, you edited a file. Save your work with `git stash`, pull, then `git stash pop`.

## 8. If something goes wrong

| What you see | What to do |
|---|---|
| `cargo metadata … program not found` | Rust is not installed, or the terminal is older than the install. Install Rust, restart, try again. |
| `link.exe not found` or `linker 'cc' not found` | The C++ build tools (Windows) or `build-essential` (Linux) are missing. Install them from step 1. |
| `error: could not compile …` with Rust file names | A real code error. Copy the whole message and send it to whoever is developing the app. |
| Window opens but is blank or white | Wait a few seconds. If it stays blank, close it, run `npm run build` once, and start again. |
| `Port 1420 is already in use` | Another copy is running. Close it, or restart the computer. |
| `npm install` fails with permission errors | Run the terminal as a normal user (not as administrator) and try again. |
| An old version still shows | Stop the running app (`Ctrl+C`), and start `npm run tauri dev` again. |

**Running only the interface in a browser** (`npm run dev`, then open http://localhost:1420) shows the screens but cannot save anything. The database, file saving and searching only work in the real app.

## 9. Working on the code with others

The app is built with React and TypeScript for the interface and Rust for the backend. Read `DEVELOPER_GUIDE.md` in the repository for the project layout. The rules that matter most:

- **Colours:** use the theme variables (`var(--accent)`, `var(--panel)`, `var(--text-main)`, `var(--border-strong)` and so on), never fixed colours. Every screen must stay readable on all 10 themes.
- **Backend calls:** the interface talks to Rust through `src/lib/api.ts`. A new Rust command must be added to `src-tauri/src/lib.rs`.
- **Before you send changes:** run `npx tsc --noEmit` (type check), `npm run build`, and test the screen you changed in the real app.

To send your work back:

```
git checkout -b my-change
git add -A
git commit -m "Describe what you changed"
git push origin my-change
```

Then open a **pull request** on GitHub so it can be reviewed and merged.
