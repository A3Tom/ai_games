import { initializeTelemetry } from './telemetry.js'

// Shared page chrome for every game, independent of its UI framework.
class GameShell extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          min-height: 100svh;
          min-width: 0;
          font: 14px/1.5 system-ui, sans-serif;
        }
        * { box-sizing: border-box; }
        header, footer { background: #10171e; color: #e7edf1; }
        header { border-bottom: 1px solid #263440; }
        footer { border-top: 1px solid #263440; color: #9cabb7; }
        .bar {
          width: min(1380px, 100%);
          margin: auto;
          padding: 6px max(24px, env(safe-area-inset-right)) 6px max(24px, env(safe-area-inset-left));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .identity { display: flex; align-items: center; min-width: 0; gap: 20px; }
        header .bar { padding-top: calc(6px + env(safe-area-inset-top, 0px)); }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          min-height: 44px;
          font-weight: 700;
          letter-spacing: -.02em;
          color: #e7edf1;
        }
        .brand-mark { width: 24px; height: 24px; color: #82dfc0; }
        .page-title {
          padding-left: 20px;
          border-left: 1px solid #35434e;
          color: #aabdc9;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .page-title:empty { display: none; }
        a { color: inherit; text-decoration: none; }
        a:focus-visible { outline: 2px solid #82dfc0; outline-offset: 3px; border-radius: 6px; }
        nav { flex-shrink: 0; }
        .home {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          gap: 8px;
          padding: 0 12px;
          border: 1px solid #30404d;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: #c7d6df;
        }
        :host([game-id="collection"]) nav { display: none; }
        @media (hover: hover) {
          .brand:hover { color: #82dfc0; }
          .home:hover { background: #1d2a35; border-color: #5b7f76; color: #b2efdd; }
          footer a:hover { color: #d0e5de; }
        }
        main { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; }
        ::slotted(*) { min-width: 0; }
        footer .bar {
          padding-top: 0;
          padding-bottom: env(safe-area-inset-bottom, 0px);
          font-size: 11px;
        }
        footer a { display: inline-flex; align-items: center; min-height: 44px; gap: 6px; white-space: nowrap; }
        .skip {
          position: fixed;
          top: 8px;
          left: 8px;
          z-index: 100;
          padding: 8px 16px;
          background: #10171e;
          color: #82dfc0;
          transform: translateY(-200%);
        }
        .skip:focus { transform: none; }
        @media (max-width: 580px) {
          .bar {
            padding-left: max(16px, env(safe-area-inset-left));
            padding-right: max(16px, env(safe-area-inset-right));
            gap: 12px;
          }
          .page-title { display: none; }
          footer .bar { flex-wrap: wrap; gap: 0 16px; }
        }
      </style>
      <a class="skip" href="#game-content">Skip to content</a>
      <header>
        <div class="bar">
          <div class="identity">
            <a class="brand" href="../">
              <svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="8" height="8" rx="2" fill="currentColor" />
                <rect x="14" y="2" width="8" height="8" rx="2" fill="currentColor" opacity=".45" />
                <rect x="2" y="14" width="8" height="8" rx="2" fill="currentColor" opacity=".45" />
                <rect x="14" y="14" width="8" height="8" rx="2" fill="currentColor" />
              </svg>
              AI Games
            </a>
            <span class="page-title"></span>
          </div>
          <nav aria-label="Collection"><a class="home" href="../"><span aria-hidden="true">←</span> All games</a></nav>
        </div>
      </header>
      <main id="game-content" tabindex="-1"><slot></slot></main>
      <!-- Add collection-wide features here when needed; empty slots take no space. -->
      <div id="shared-features"><slot name="shared"></slot></div>
      <footer>
        <div class="bar">
          <span>A collection of browser games.</span>
          <a href="https://github.com/A3Tom/ai_games" target="_blank" rel="noopener noreferrer">View source <span aria-hidden="true">↗</span></a>
        </div>
      </footer>
    `
    // Focus the content without changing a game's hash-based route or invite URL.
    this.shadowRoot.querySelector('.skip').addEventListener('click', (event) => {
      event.preventDefault()
      this.shadowRoot.querySelector('main').focus()
    })
  }

  connectedCallback() {
    initializeTelemetry(this.getAttribute('game-id'))
    const home = this.getAttribute('home-href') || '../'
    this.shadowRoot.querySelector('.brand').setAttribute('href', home)
    this.shadowRoot.querySelector('.home').setAttribute('href', home)
    this.shadowRoot.querySelector('.page-title').textContent = this.getAttribute('page-title') || ''
  }
}

customElements.define('game-shell', GameShell)
