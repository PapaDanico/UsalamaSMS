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
    /* ============================================================
       ONLY WHEN THE PATH CHANGED.

       THE DEFECT: this was `() => this.render()`. Chrome fires popstate
       for a same-document hash change, so clicking any in-page anchor
       re-rendered the whole screen from scratch — which wiped the DOM
       the browser was about to scroll to and reset the scroll position
       to zero.

       Every in-page anchor in the product was therefore dead. The
       contents list on six document pages, the footer's link to the
       deadlines section, and the skip link that is the first thing a
       keyboard user reaches: all of them changed the URL, did nothing
       visible, and left the reader at the top of the page.

       Nothing in the suite could see it. A re-render produces the same
       markup, so every selector still matched, every assertion still
       passed, and the only evidence was a scroll position — which
       nothing was reading.

       Re-rendering the CURRENT path on demand is still deliberate and
       still available: navigate() does it when asked for the route it
       is already on. This is the other case, and the two are not the
       same event.
       ============================================================ */
    this._onPop = () => {
      if (this.current !== this.path) this.render();
    };
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

      /* THE WHOLE HREF GOES TO navigate(), which is the fix for the
         same defect twice.

         normalise() strips ? and # — correctly, since a route is
         matched on its path — and this handler used to rebuild the URL
         from the STRIPPED result. The first casualty was the fragment:
         the footer's "/#deadlines", the link to the regulatory basis
         and the most consequential thing down there, navigated to the
         landing page and scrolled to the top. It had never once worked,
         and it was fixed by re-attaching the hash here.

         The query string was the identical bug sitting beside the
         identical fix, unnoticed because nothing used one until the
         triage queue started handing the register a report to raise a
         hazard from. Re-attaching the search too would have been a
         third copy of the same three lines.

         So the href travels intact and navigate() does the parsing,
         once. Two places splitting a URL is how the two came to
         disagree about which parts of it matter. */
      event.preventDefault();
      this.navigate(href);
    });

    this.render();
    return this;
  }

  get path() {
    return normalise(window.location.pathname);
  }

  navigate(path, { replace = false } = {}) {
    const input = String(path);
    const hash = input.includes('#') ? input.slice(input.indexOf('#')) : '';
    /* THE QUERY STRING SURVIVES THE NAVIGATION, and until this line it
       did not. `normalise()` strips ? and # because a route is matched
       on its path — that part is right — but the result was then pushed
       to history as the whole URL, so every query string was discarded
       the moment a link was followed inside the app. A link pasted into
       the address bar kept it and the same link clicked in the product
       lost it, which is the kind of difference nobody reproduces.

       Nothing used one until now, which is why it went unnoticed: the
       first caller is the triage queue handing the register a report to
       raise a hazard from, and it carries an ID rather than any of the
       report's content precisely because a URL is written to history,
       to a referrer header, and over somebody's shoulder. */
    const withoutHash = hash ? input.slice(0, input.indexOf('#')) : input;
    const search = withoutHash.includes('?')
      ? withoutHash.slice(withoutHash.indexOf('?'))
      : '';
    const target = normalise(input);
    const url = target + search + hash;

    if (target === this.path && search === window.location.search) {
      /* Same route. If a fragment came with it, this is an in-page
         move and re-rendering would destroy the element being scrolled
         to — the same defect popstate had. Without one it is a request
         to redraw the current screen, which is deliberate. */
      if (hash) {
        window.history.pushState({}, '', url);
        this.scrollToFragment(hash);
      } else {
        this.render();
      }
      return;
    }

    if (replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
    this.render();
  }

  /* Scroll to a fragment on the screen that is now rendered.
     scrollIntoView rather than assigning location.hash: the hash is
     already set by the time this runs, so assigning it again would be a
     no-op, and this way the CSS scroll-margin (which clears the sticky
     header — WCAG 2.2 SC 2.4.11) is applied either way. */
  scrollToFragment(hash) {
    const id = hash.replace(/^#/, '');
    if (!id) return false;
    const target = document.getElementById(id);
    if (!target) return false;
    target.scrollIntoView();
    // Focus follows the scroll, or a keyboard user is left where they
    // were while the sighted view moved somewhere else entirely.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    return true;
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

    /* Top, UNLESS the URL asked for somewhere in particular. A route
       reached as /#deadlines has to land on the deadlines, and a
       scroll-to-top here would undo the fragment the click preserved.
       Deferred a frame because an async screen has not written its
       markup yet, so the element may not exist at this instant. */
    const pendingHash = window.location.hash;
    if (pendingHash) {
      requestAnimationFrame(() => {
        if (!this.scrollToFragment(pendingHash)) {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

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
    if (this._hasRendered && !pendingHash) {
      this.outlet.focus({ preventScroll: true });
    }
    this._hasRendered = true;

    // Keep the head in step with the route for anything that reads it
    // after navigation — social crawlers that execute JS, and the
    // browser's own history entries.
    /* WHICH KIND OF SURFACE THIS IS, stamped on the root so the
       stylesheet can tell an instrument from a document.
     *
     * The product has two audiences on one type scale and they want
     * opposite things. A prospective operator reading /about or
     * /pricing is being persuaded, and a 52px headline over a
     * generous measure is the right instrument for that. A safety
     * manager working the triage queue is not being persuaded — they
     * are looking for a row — and the same heading spends 150px of
     * vertical before the first piece of work appears.
     *
     * style.css has argued for this split since the display face
     * landed: the identity belongs on "headlines, the wordmark, the
     * display type on the document pages a prospective operator judges
     * the practice by", while "the interface — fields, tables, badges,
     * the queue, the deadline figures — stays in DM Sans". That was
     * true of the components and never true of the headings, because
     * `h1, h2, h3, h4` set the display face globally. This is the line
     * being drawn where the file already said it was.
     *
     * ON THE ROOT RATHER THAN THE OUTLET, so a rule can reach the
     * header and the footer too, and DEFAULTING TO DOCUMENT: a screen
     * that forgets to declare itself gets the editorial treatment,
     * which is wrong in a way somebody notices rather than a way that
     * quietly under-sets a landing page. */
    document.documentElement.dataset.surface = match?.meta?.surface ?? 'document';

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
