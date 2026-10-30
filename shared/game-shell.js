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
          font: 14px/1.5 system-ui, sans-serif;
        }
        * { box-sizing: border-box; }
        header, footer { background: #10171e; color: #e7edf1; }
        header { border-bottom: 1px solid #2b3945; }
        footer { border-top: 1px solid #2b3945; color: #9cabb7; }
        .bar {
          width: min(1360px, 100%);
          margin: auto;
          padding: 18px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px 24px;
        }
        .identity { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; }
        .brand { font-weight: 700; letter-spacing: .04em; color: #82dfc0; }
        .page-title { color: #b7c8d3; }
        .page-title:empty { display: none; }
        a { color: inherit; text-decoration: none; }
        a:hover { text-decoration: underline; }
        a:focus-visible { outline: 2px solid #82dfc0; outline-offset: 4px; }
        main { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; }
        ::slotted(*) { min-width: 0; }
        footer .bar { font-size: 12px; }
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
        @media (max-width: 580px) { .bar { padding: 16px; gap: 8px 16px; } }
      </style>
      <a class="skip" href="#game-content">Skip to content</a>
      <header>
        <div class="bar">
          <div class="identity">
            <a class="brand" href="../">AI Games</a>
            <span class="page-title"></span>
          </div>
          <nav aria-label="Collection"><a class="home" href="../">All games <span aria-hidden="true">↗</span></a></nav>
        </div>
      </header>
      <main id="game-content" tabindex="-1"><slot></slot></main>
      <!-- Add collection-wide features here when needed; empty slots take no space. -->
      <div id="shared-features"><slot name="shared"></slot></div>
      <footer>
        <div class="bar">
          <span>Built with coding agents, played in a browser.</span>
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
