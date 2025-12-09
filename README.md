# AI Games Collection

A collection of games built with AI assistance, hosted on GitHub Pages.

## 🎮 Games

### [💣 Minesweeper](./minesweeper)
Classic minesweeper built with React and TypeScript
- Multiple difficulty levels (Beginner, Intermediate, Expert)
- Progress tracking with statistics
- Win/Loss/Reset tracking
- Fastest and average solve time tracking
- Timer and mine counter
- First click always safe

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS

[Play Minesweeper →](https://a3tom.github.io/ai_games/minesweeper/)

### [❄️ Snow Drift](./snow_drift)
Navigate through snowy terrain
- HTML5 Canvas game
- Particle effects
- Pickup system

**Tech Stack:** HTML5, Canvas, JavaScript

[Play Snow Drift →](https://a3tom.github.io/ai_games/snow_drift/)

## 🚀 Deployment

The games are automatically deployed to GitHub Pages when code is pushed to the master branch.

**Live Site:** https://a3tom.github.io/ai_games/

## 📁 Project Structure

```
ai_game_projects/
├── minesweeper/          # React + TypeScript minesweeper game
│   ├── src/
│   ├── dist/             # Built files
│   ├── package.json
│   └── README.md
├── snow_drift/           # HTML5 Canvas game
│   ├── js/
│   ├── index.html
│   └── README.md
└── .github/
    └── workflows/
        └── deploy.yml    # GitHub Actions deployment workflow
```

## 🛠️ Adding New Games

To add a new game to this collection:

1. **Create a new directory** for your game in the root:
   ```bash
   mkdir my-new-game
   cd my-new-game
   ```

2. **Build your game** (can be any framework or vanilla HTML/JS)

3. **Update `index.html`** in the repository root:
   Add a new game card to the games grid:
   ```html
   <a href="./my-new-game/" class="game-card">
       <h2>🎯 My New Game</h2>
       <p>Description of your game</p>
       <span class="tag">Tech Stack</span>
   </a>
   ```

4. **Update the deployment workflow** (`.github/workflows/deploy.yml`):
   
   If your game needs building (TypeScript/React/etc):
   ```yaml
   - name: Build My New Game
     run: |
       cd my-new-game
       npm ci
       npm run build
   
   - name: Copy My New Game
     run: |
       mkdir -p deploy/my-new-game
       cp -r my-new-game/dist/* deploy/my-new-game/
   ```
   
   For vanilla HTML/JS games:
   ```yaml
   - name: Copy My New Game
     run: |
       mkdir -p deploy/my-new-game
       cp -r my-new-game/* deploy/my-new-game/
   ```

5. **Commit and push** - GitHub Actions will automatically deploy!

## 🏗️ Development

### For TypeScript/React Projects (like Minesweeper)
```bash
cd minesweeper
npm install
npm run dev
```

### For Vanilla HTML/JS Projects (like Snow Drift)
Simply open `index.html` in your browser or use a local server:
```bash
cd snow_drift
python -m http.server 8000
# or
npx serve
```

## 📝 License

Each game may have its own license. Check individual project directories for details.
