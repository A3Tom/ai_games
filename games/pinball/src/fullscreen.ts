/** Fullscreen on desktop, a viewport-sized play area on touch devices. */
export function setupFullscreen(panel: HTMLElement, button: HTMLButtonElement) {
  const page = panel.ownerDocument
  const view = page.defaultView!
  const originalRole = panel.getAttribute('role')
  const originalModal = panel.getAttribute('aria-modal')
  let expanded = false
  let pending: Promise<void> | undefined
  let lastMode = ''
  let scrollPosition = { left: 0, top: 0 }
  let bodyAlreadyExpanded = false

  const mode = () =>
    expanded ? 'expanded' : page.fullscreenElement === panel ? 'native' : ''
  const restoreAttribute = (name: string, value: string | null) => {
    if (value === null) panel.removeAttribute(name)
    else panel.setAttribute(name, value)
  }

  function sync() {
    const current = mode()
    const label =
      current === 'native'
        ? 'Exit full screen'
        : current
          ? 'Exit expanded view'
          : 'Expand game'
    button.textContent = current ? 'Exit' : 'Expand'
    button.title = label
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', String(Boolean(current)))
    if (current) {
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
    } else {
      restoreAttribute('role', originalRole)
      restoreAttribute('aria-modal', originalModal)
    }
    if (current !== lastMode) {
      const exited = Boolean(lastMode) && !current
      lastMode = current
      panel.dispatchEvent(new CustomEvent('pinballviewchange'))
      if (exited) button.focus({ preventScroll: true })
    }
  }

  function enterExpanded() {
    scrollPosition = { left: view.scrollX, top: view.scrollY }
    bodyAlreadyExpanded = page.body.classList.contains('pinball-expanded')
    expanded = true
    panel.classList.add('is-expanded')
    page.body.classList.add('pinball-expanded')
    sync()
    button.focus({ preventScroll: true })
  }

  function leaveExpanded() {
    expanded = false
    panel.classList.remove('is-expanded')
    if (!bodyAlreadyExpanded) page.body.classList.remove('pinball-expanded')
    sync()
    // Restore immediately even when the page has smooth scrolling enabled.
    view.scrollTo({ ...scrollPosition, behavior: 'instant' })
  }

  async function toggle() {
    try {
      if (expanded) leaveExpanded()
      else if (page.fullscreenElement === panel) await page.exitFullscreen()
      else if (
        view.navigator.maxTouchPoints > 0 ||
        view.matchMedia('(any-pointer: coarse)').matches ||
        typeof panel.requestFullscreen !== 'function' ||
        page.fullscreenEnabled === false
      )
        enterExpanded()
      else {
        try {
          await panel.requestFullscreen()
        } catch {
          enterExpanded()
        }
      }
    } finally {
      sync()
    }
  }

  function transition(action: () => Promise<void>) {
    const task = action()
      .catch(() => sync())
      .finally(() => {
        if (pending === task) pending = undefined
      })
    pending = task
    return task
  }

  async function exit() {
    // A game can end while the browser is still processing entry. Wait for that
    // request before leaving so it cannot hide the score form after we return.
    while (pending) await pending
    await transition(async () => {
      try {
        if (expanded) leaveExpanded()
        else if (page.fullscreenElement === panel) await page.exitFullscreen()
      } finally {
        sync()
      }
    })
    return !mode()
  }

  function focusableElements() {
    return [
      ...panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => {
      const style = view.getComputedStyle(node)
      return (
        !node.closest('[hidden], [inert], dialog:not([open])') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    })
  }

  function keydown(event: KeyboardEvent) {
    if (!mode()) return
    // Native dialogs provide their own focus containment and Escape behavior.
    if (panel.querySelector('dialog[open]')) return
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      leaveExpanded()
    } else if (event.key === 'Tab') {
      const items = focusableElements()
      const first = items[0] || button
      const last = items.at(-1) || button
      if (
        event.shiftKey &&
        (page.activeElement === first || !panel.contains(page.activeElement))
      ) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (
        !event.shiftKey &&
        (page.activeElement === last || !panel.contains(page.activeElement))
      ) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
  }

  function containFocus(event: FocusEvent) {
    if (mode() && !panel.contains(event.target as Node))
      button.focus({ preventScroll: true })
  }

  // Rejected entry falls back to expanded view; a rejected exit keeps the current
  // state and lets the browser's own exit gesture remain available.
  const click = () => {
    if (!pending) void transition(toggle)
  }
  button.addEventListener('click', click)
  page.addEventListener('fullscreenchange', sync)
  page.addEventListener('keydown', keydown)
  page.addEventListener('focusin', containFocus)
  sync()

  return {
    exit,
    destroy() {
      button.removeEventListener('click', click)
      page.removeEventListener('fullscreenchange', sync)
      page.removeEventListener('keydown', keydown)
      page.removeEventListener('focusin', containFocus)
      if (expanded) leaveExpanded()
      restoreAttribute('role', originalRole)
      restoreAttribute('aria-modal', originalModal)
    },
  }
}
