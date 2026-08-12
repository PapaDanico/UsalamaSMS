/* ============================================================
   Path-based SPA router (History API).

   This was hash-based, which is simpler to host but costs the thing
   that matters commercially: a crawler treats `/#/scorecard` as the same
   document as `/`, so the entire tool inventory was invisible. Every
   route is now a real URL with a real pre-rendered document behind it
   (scripts/prerender.mjs), and the client takes over from there.

   The hosting cost is that each route needs a file. The build generates
   them, so there is nothing to configure per tool.
   ============================================================ */

class Router {
  constructor() {
    this.routes = new Map();
    this.notFound = null;
    this.outlet = null;
    this.current = null;
    this._onPop = () => this.render();
  }

  register(path, handler, meta = {}) {
    this.routes.set(normalise(path), { handler, meta });
    return this;
  }

  setNotFound(handler) {
    this.notFound = handler;
    return this;
  }

  start(outlet) {
    this.outlet = outlet;
    window.addEventListener('popstate', this._onPop);

    // One delegated listener rather than a handler per link, so markup
    // generated later is covered without re-binding.
    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('a');
      if (!link) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download')) return;

      const href = link.getAttribute('href');
      if (!href || !href.startsWith('/')) return; // external, mailto, tel, in-page anchor
      if (link.origin && link.origin !== window.location.origin) return;

      const path = normalise(href);
      if (!this.routes.has(path)) return; // let the server answer

      event.preventDefault();
      this.navigate(path);
    });

    this.render();
    return this;
  }

  get path() {
    return normalise(window.location.pathname);
  }

  navigate(path, { replace = false } = {}) {
    const target = normalise(path);
    if (target === this.path) {
      this.render();
      return;
    }
    if (replace) window.history.replaceState({}, '', target);
    else window.history.pushState({}, '', target);
    this.render();
  }

  back() {
    if (window.history.length > 1) window.history.back();
    else this.navigate('/');
  }

  route(path) {
    return this.routes.get(normalise(path)) || null;
  }

  render() {
    if (!this.outlet) return;

    const path = this.path;
    const match = this.routes.get(path);
    this.current = path;

    /* HANDLER CONTRACT — changed from the one this was ported from.

       There, handlers take no arguments and RETURN a DOM node, which
       the router appends. That works when every screen is synchronous.
       This product's triage queue reads IndexedDB, so its render is
       async, and a returned promise would have been appended as the
       string "[object Promise]" — which is exactly what happened: the
       form never rendered and nothing threw.

       Here a handler RECEIVES THE OUTLET and writes into it. A node
       returned by a synchronous handler is still appended, so a screen
       written either way works, and an async handler is awaited so a
       route that throws is reported rather than swallowed. */
    this.outlet.replaceChildren();

    let view;
    try {
      view = match ? match.handler(this.outlet) : this.notFound ? this.notFound(this.outlet, path) : null;
    } catch (error) {
      console.error(`Route "${path}" failed to render:`, error);
      this.outlet.replaceChildren(renderRouteError(error));
      view = null;
    }

    if (view instanceof Node) {
      this.outlet.appendChild(view);
    } else if (view && typeof view.then === 'function') {
      // An async screen. The outlet is already cleared, so an empty
      // frame is visible until it resolves — acceptable for a local
      // IndexedDB read, and a rejection must still be surfaced rather
      // than becoming an unhandled promise nobody sees.
      view.catch((error) => {
        console.error(`Route "${path}" failed to render:`, error);
        this.outlet.replaceChildren(renderRouteError(error));
      });
    }

    window.scrollTo({ top: 0, behavior: 'auto' });

    /* Move focus to the new screen.

       replaceChildren() destroys whatever was focused inside the outlet,
       and the browser's fallback is <body>. For anyone navigating by
       keyboard that means the next Tab restarts at the top of the
       document — so following a link from deep inside a tool throws you
       back to the skip link. For a screen reader it means the page
       silently becomes a different page: the title changes, and nothing
       is announced.

       The outlet already carries tabIndex -1 so the skip link can target
       it, which makes this the same move the skip link performs, at the
       moment navigation happens.

       Not on first render. On load, focus belongs where the browser put
       it — pulling it into the outlet would skip the header for someone
       who has just arrived, and fight the browser's own restoration when
       returning to a page. preventScroll because the scroll position is
       set on the line above and focus must not override it. */
    if (this._hasRendered) {
      this.outlet.focus({ preventScroll: true });
    }
    this._hasRendered = true;

    // Keep the head in step with the route for anything that reads it
    // after navigation — social crawlers that execute JS, and the
    // browser's own history entries.
    document.title = match?.meta?.title
      ? `${match.meta.title} — UsalamaSMS`
      : 'UsalamaSMS — Safety intelligence for African skies';

    if (match?.meta?.description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', match.meta.description);
    }

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', new URL(path, window.location.origin).href);

    window.dispatchEvent(new CustomEvent('routechange', { detail: { path } }));
  }
}

/** A trailing slash and an /index.html suffix both mean the same route. */
function normalise(input) {
  let path = String(input || '/')
    .split('?')[0]
    .split('#')[0];
  path = path.replace(/\/index\.html$/, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

function renderRouteError(error) {
  const div = document.createElement('div');
  div.className = 'container-narrow page';
  div.innerHTML = `
    <div class="empty-state">
      <h3>Something went wrong on this screen</h3>
      <p>The rest of the app is unaffected and your saved work is intact.</p>
      <a class="btn btn-secondary" href="/">Return to the dashboard</a>
    </div>`;
  const detail = document.createElement('pre');
  detail.className = 'sr-only';
  detail.textContent = String(error?.stack || error);
  div.appendChild(detail);
  return div;
}

export const router = new Router();
