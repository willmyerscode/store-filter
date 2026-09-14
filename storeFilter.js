/**
 * Store Filter Plugin for Squarespace
 * Adds search, category/tag/custom filters, a price range slider and
 * client side pagination to a Squarespace store page.
 * Every product in the store is loaded up front, so filtering searches the
 * whole catalogue rather than the current page of results. The products
 * themselves are Squarespace's own markup, so the layout keeps whatever
 * the section settings say it should be.
 * Copyright Will-Myers.com
 **/

class WMStoreFilter {
  static pluginName = 'store-filter';

  static emitEvent(type, detail = {}, elem = document) {
    elem.dispatchEvent(
      new CustomEvent(`wm-${WMStoreFilter.pluginName}${type}`, {
        detail,
        bubbles: true
      })
    );
  }

  static defaultSettings = {
    enabled: true,
    position: 'side', // 'side' | 'top' ('left' is still accepted for 'side')
    search: true,
    searchPosition: 'beginning', // 'beginning' (above the groups) | 'end' (below them)
    searchLabel: 'Search',
    searchPlaceholder: 'Search',
    filters: 'auto', // 'auto' or an array of custom filter groups
    showCategories: true,
    showTags: true,
    categoriesLabel: 'Category',
    tagsLabel: 'Tag',
    multiSelect: true, // default for auto built groups
    matchMode: 'any', // 'any' | 'all' — default when multiple options are selected
    optionStyle: 'list', // 'list' (tick boxes) | 'buttons' (pills). Per group: style: 'buttons'
    mobileLayout: 'drawer', // 'drawer' (filter icon + slide-out) | 'top' (row of dropdowns)
    topAlignment: 'spread', // top layout only: 'spread' | 'left' | 'right' | 'center'
    collapsible: true,
    startCollapsed: false,
    priceFilter: 'auto', // true | false | 'auto' (products only)
    priceLabel: 'Price',
    pagination: {
      enabled: true,
      itemsPerPage: 'auto', // 'auto' matches the count Squarespace rendered
      type: 'numbers', // 'numbers' | 'loadMore' | 'none'
      loadMoreText: 'Load More',
      previousText: 'Previous',
      nextText: 'Next',
      scrollToTop: true
    },
    showResultCount: true,
    showOptionCounts: true,
    resultCountText: '{count} Results',
    resultCountSingularText: '{count} Result',
    filtersTitle: 'Filters',
    filterButtonText: 'Filter',
    clearText: 'Clear All',
    applyText: 'Show {count} Results',
    noResultsTitle: 'No results found',
    noResultsText: 'No results match your search. Try removing a few filters.',
    loadingText: 'Loading filters',
    mobileBreakpoint: 767,
    searchIncludesBody: false,
    maxPages: 30,
    maxCategories: 25,
    listSelector: null, // override the grid container selector
    itemSelector: null // override the item selector
  };

  /* Known Squarespace product list layouts, most specific first. Each entry
     is a grid container and the item inside it. */
  static layouts = [
    {name: 'products', container: '.product-list-layout-container', item: '.product-list-item'},
    {name: 'products-classic', container: '.products.collection-content-wrapper', item: '.grid-item'},
    {name: 'products-grid', container: '.ProductList-grid', item: '.ProductList-item'}
  ];

  static icons = {
    filter:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>',
    search:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrowLeft:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    arrowRight:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
  };

  constructor(settings = {}) {
    this.settings = WMStoreFilter.mergeSettings(
      WMStoreFilter.defaultSettings,
      settings
    );
    this.pluginName = WMStoreFilter.pluginName;

    this.collection = null;
    this.list = null; // {container, itemSelector, layout}
    this.categoryNames = new Map(); // category id -> display name
    this.entries = []; // [{id, url, node, categories, tags, price, searchText}]
    this.groups = []; // filter group models
    this.priceRange = null; // {min, max, step, currency}
    this.state = {search: '', groups: {}, price: null, page: 1};

    this.elements = {};
    this.isDrawerOpen = false;
    this.isMobile = false;
    this.hasLoaded = false;

    /* init() is async, so without this an unexpected throw would surface as a
       bare unhandled rejection with no clue which plugin produced it. */
    this.init().catch(error => {
      console.error(`[${WMStoreFilter.pluginName}] Initialization failed`, error);
    });
  }

  /* Deep merge that only recurses into plain objects, so `pagination` can be
     set partially without wiping the other pagination defaults. */
  static mergeSettings(defaults, overrides) {
    const isPlainObject = value =>
      !!value && typeof value === 'object' && !Array.isArray(value);
    const merged = {...defaults};
    Object.keys(overrides || {}).forEach(key => {
      const value = overrides[key];
      merged[key] =
        isPlainObject(value) && isPlainObject(defaults[key])
          ? WMStoreFilter.mergeSettings(defaults[key], value)
          : value;
    });
    return merged;
  }

  async init() {
    if (!this.settings.enabled) return;

    WMStoreFilter.emitEvent(':beforeInit', {instance: this});

    this.list = this.detectList();
    if (!this.list) {
      console.warn(
        `[${this.pluginName}] Could not find a product grid on this page. This plugin runs on store pages only — set listSelector and itemSelector in the settings if your store uses custom markup.`
      );
      return;
    }

    this.collection = this.detectCollection();
    if (!this.collection) {
      console.warn(
        `[${this.pluginName}] This page is not a store page, or the store it shows could not be worked out from the products on it.`
      );
      return;
    }

    this.isMobile = this.getIsMobile();
    this.buildShell();
    this.watchForEditor();
    this.applyNavigationColor();
    this.applyStickyOffset();
    this.alignToLogo();
    this.bindEvents();

    try {
      await this.loadCollection();
    } catch (error) {
      console.error(`[${this.pluginName}] Could not load the collection`, error);
      this.teardownShell();
      return;
    }

    if (!this.entries.length) {
      console.warn(`[${this.pluginName}] No collection items could be matched to the page.`);
      this.teardownShell();
      return;
    }

    this.hasLoaded = true;
    this.buildGroups();
    this.buildPanel();
    this.root.classList.remove('is-loading');
    this.render();

    WMStoreFilter.emitEvent(':loaded', {instance: this, items: this.entries.length});
    WMStoreFilter.emitEvent(':afterInit', {instance: this, el: this.root});
    WMStoreFilter.emitEvent(':ready', {instance: this, el: this.root});
  }

  /* ================================
     DETECTION
     ================================ */

  get context() {
    return (window.Static && window.Static.SQUARESPACE_CONTEXT) || {};
  }

  /* Stores only. A page has to be a products collection, or be showing a
     product list section, before any of this runs. */
  detectCollection() {
    const collection = this.context.collection || {};
    const typeName = collection.typeName || '';
    const isStore = typeName === 'products';

    if (!isStore && !this.listLooksLikeProducts()) return null;

    if (isStore && collection.fullUrl) {
      return {
        id: collection.id || null,
        url: this.normalizeUrl(collection.fullUrl),
        typeName,
        isProducts: true
      };
    }

    /* A product list section can be dropped onto an ordinary page, where the
       page's own collection is not the one on show. Work the collection out
       from where its items link to instead. */
    const derived = this.deriveCollectionUrl();
    if (!derived) return null;

    return {id: null, url: derived, typeName: 'products', isProducts: true};
  }

  listLooksLikeProducts() {
    if (!this.list) return false;
    if (this.list.layout.indexOf('products') === 0) return true;
    return !!this.list.container.closest(
      '[data-sqsp-section="product-list"], .product-list-section, .products'
    );
  }

  /* /shop/p/a-product → /shop */
  deriveCollectionUrl() {
    const link = this.list.container.querySelector('a[href]');
    if (!link) return null;

    const path = this.normalizeUrl(link.getAttribute('href')).split('?')[0];
    if (path.indexOf('/') !== 0) return null;

    const productSplit = path.indexOf('/p/');
    if (productSplit > 0) return path.slice(0, productSplit);

    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    segments.pop();
    return `/${segments.join('/')}`;
  }

  detectList() {
    if (this.settings.listSelector) {
      const container = document.querySelector(this.settings.listSelector);
      if (!container) return null;
      return {
        container,
        itemSelector: this.settings.itemSelector || ':scope > *',
        layout: 'custom'
      };
    }

    for (const layout of WMStoreFilter.layouts) {
      const container = document.querySelector(layout.container);
      if (!container) continue;
      const items = container.querySelectorAll(layout.item);
      if (!items.length) continue;
      return {container, itemSelector: layout.item, layout: layout.name};
    }
    return null;
  }

  getNativeNodes() {
    return Array.from(this.list.container.querySelectorAll(this.list.itemSelector));
  }

  currentLayoutSelector() {
    if (this.settings.listSelector) return this.settings.listSelector;
    const layout = WMStoreFilter.layouts.find(entry => entry.name === this.list.layout);
    if (layout) return layout.container;
    const classes = Array.from(this.list.container.classList);
    return classes.length ? `.${classes.join('.')}` : this.list.container.tagName.toLowerCase();
  }

  /* ================================
     DATA LOADING
     ================================ */

  async loadCollection() {
    const records = [];
    const nodesByKey = new Map();

    /* Page one is already rendered on the page — reuse those nodes rather
       than fetching and re-hydrating markup we already have. */
    this.getNativeNodes().forEach(node => {
      const key = this.getNodeKey(node);
      if (key && !nodesByKey.has(key)) nodesByKey.set(key, node);
    });

    let url = this.collection.url;
    let page = 0;

    while (url && page < this.settings.maxPages) {
      /* The JSON and the markup for a page are two separate requests, so
         start them together rather than waiting for the first to land. */
      const nodesRequest = page > 0 ? this.fetchNodes(url) : null;
      const json = await this.fetchJson(url);
      if (!json) break;

      this.collectCategoryNames(json);

      const items = Array.isArray(json.items) ? json.items : [];
      items.forEach(item => records.push(item));

      if (nodesRequest) {
        const nodes = await nodesRequest;
        nodes.forEach(node => {
          const key = this.getNodeKey(node);
          if (key && !nodesByKey.has(key)) nodesByKey.set(key, node);
        });
      }

      url = this.getNextPageUrl(json.pagination, this.collection.url);
      page += 1;
    }

    this.entries = records
      .map(item => this.buildEntry(item, nodesByKey))
      .filter(Boolean);

    await this.applyCategoryMembership();

    const dropped = records.length - this.entries.length;
    if (dropped > 0) {
      console.warn(
        `[${this.pluginName}] ${dropped} of ${records.length} items could not be matched to markup on the page and were left out of the filters.`
      );
    }
  }

  getNextPageUrl(pagination, baseUrl) {
    if (!pagination || !pagination.nextPage) return null;
    if (pagination.nextPageUrl) return this.normalizeUrl(pagination.nextPageUrl);
    if (pagination.nextPageOffset) {
      return this.appendParams(baseUrl, {offset: pagination.nextPageOffset});
    }
    return null;
  }

  /* Squarespace's newer nested store categories are not in the collection
     JSON and are not printed on the items, but each one has its own page.
     Ask every category which products it holds and label them from that. */
  async applyCategoryMembership() {
    /* Only worth the extra requests when the JSON carried no categories at
       all — ids resolved above are always preferred. */
    if (this.entries.some(entry => entry.categories.length)) return;

    const links = this.discoverCategoryLinks().slice(0, this.settings.maxCategories);
    if (!links.length) return;

    const byId = new Map();
    const byUrl = new Map();
    this.entries.forEach(entry => {
      if (entry.id) byId.set(entry.id, entry);
      if (entry.url) byUrl.set(entry.url, entry);
    });

    const results = await Promise.all(
      links.map(link => this.fetchCategoryMembers(link.url).then(members => ({link, members})))
    );

    results.forEach(({link, members}) => {
      members.forEach(member => {
        const entry = byId.get(member.id) || byUrl.get(member.url);
        if (!entry) return;
        if (entry.categories.indexOf(link.label) === -1) entry.categories.push(link.label);
      });
    });
  }

  discoverCategoryLinks() {
    const found = new Map();
    const base = this.collection.url;

    const add = (href, label) => {
      const text = (label || '').replace(/\s+/g, ' ').trim();
      if (!href || !text) return;
      const url = this.normalizeUrl(href).split('?')[0];
      /* Category pages live under the collection; products and the "all"
         link are not categories. */
      if (url.indexOf(`${base}/`) !== 0) return;
      if (url.indexOf('/p/') > -1) return;
      if (!found.has(url)) found.set(url, {url, label: text});
    };

    document
      .querySelectorAll(
        '.product-list-category-link, .nested-category-tree-wrapper a[href], .product-list-category-subnav-container a[href]'
      )
      .forEach(link => add(link.getAttribute('href'), link.textContent));

    document
      .querySelectorAll('.product-filter-dropdown-select option[value]')
      .forEach(option => add(option.value, option.textContent));

    return Array.from(found.values());
  }

  async fetchCategoryMembers(url) {
    const members = [];
    let next = url;
    let page = 0;

    while (next && page < this.settings.maxPages) {
      const json = await this.fetchJson(next);
      if (!json) break;
      (json.items || []).forEach(item => {
        members.push({id: item.id, url: this.normalizeUrl(item.fullUrl || '')});
      });
      next = this.getNextPageUrl(json.pagination, url);
      page += 1;
    }

    return members;
  }

  async fetchJson(url) {
    const endpoint =
      WMStoreFilter.jsonEndpoint(url) ||
      this.appendParams(url, {format: 'json', nocookie: 'true'});
    let answered = endpoint;

    try {
      let response = await WMStoreFilter.request(endpoint);

      /* A collection that redirects — a store with a default category, say —
         drops the format=json param on the way, so ask the destination again. */
      if (response.redirected && response.url && response.url.indexOf('format=json') === -1) {
        const target = this.normalizeUrl(response.url).split('?')[0];
        answered =
          WMStoreFilter.jsonEndpoint(target) ||
          this.appendParams(target, {format: 'json', nocookie: 'true'});
        response = await WMStoreFilter.request(answered);
      }

      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      /* The parsed items are all that is needed from here on, so let the raw
         body go rather than holding a copy of every page in the cache. */
      const body = response.body;
      WMStoreFilter.requests.delete(endpoint);
      WMStoreFilter.requests.delete(answered);

      try {
        return JSON.parse(body);
      } catch (error) {
        throw new Error(
          'the collection returned a web page instead of JSON — it may redirect, need a password, or sit behind a member area'
        );
      }
    } catch (error) {
      /* Drop the failed attempt so a later call can try the page again. */
      WMStoreFilter.requests.delete(endpoint);
      WMStoreFilter.requests.delete(answered);
      console.warn(`[${this.pluginName}] Could not load ${endpoint} — ${error.message}`);
      return null;
    }
  }

  async fetchNodes(url) {
    try {
      const response = await fetch(url, {credentials: 'same-origin'});
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const markup = await response.text();
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      const container = doc.querySelector(
        this.settings.listSelector || this.currentLayoutSelector()
      );
      if (!container) return [];
      return Array.from(container.querySelectorAll(this.list.itemSelector)).map(node =>
        document.importNode(node, true)
      );
    } catch (error) {
      console.warn(`[${this.pluginName}] Could not load the markup for ${url}`, error);
      return [];
    }
  }

  buildEntry(item, nodesByKey) {
    const url = this.normalizeUrl(item.fullUrl || '');
    const node = nodesByKey.get(item.id) || nodesByKey.get(url);
    if (!node) return null;

    /* Newer stores don't always put their categories in the collection JSON,
       but Squarespace still prints them on the item as category-/tag- classes. */
    let categories = this.getItemCategories(item);
    let tags = Array.isArray(item.tags) ? item.tags.slice() : [];
    if (!categories.length) categories = this.getTaxonomyFromNode(node, 'category');
    if (!tags.length) tags = this.getTaxonomyFromNode(node, 'tag');
    const price = this.getItemPrice(item);

    const searchParts = [item.title, this.stripHtml(item.excerpt), ...categories, ...tags];
    if (this.settings.searchIncludesBody) searchParts.push(this.stripHtml(item.body));

    return {
      id: item.id,
      url,
      node,
      title: item.title || '',
      categories,
      tags,
      price,
      searchText: searchParts
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    };
  }

  getItemPrice(item) {
    const content = item.structuredContent || {};
    const variants = Array.isArray(content.variants) ? content.variants : [];
    const values = [];
    let currency = null;

    const readMoney = money => {
      if (!money) return null;
      const raw = money.value != null ? money.value : money.decimalValue;
      const value = parseFloat(raw);
      if (Number.isNaN(value)) return null;
      if (!currency && money.currency) currency = money.currency;
      return value;
    };

    variants.forEach(variant => {
      const money =
        variant.onSale && variant.salePriceMoney ? variant.salePriceMoney : variant.priceMoney;
      const value = readMoney(money);
      if (value !== null) values.push(value);
    });

    if (!values.length) {
      const fallback = readMoney(content.priceMoney || content.salePriceMoney);
      if (fallback !== null) values.push(fallback);
    }

    if (!values.length) return null;
    return {min: Math.min(...values), max: Math.max(...values), currency};
  }

  /* Categories reach the JSON in several shapes depending on how old the
     store is: plain names, ids that point at a list elsewhere in the
     response, or objects carrying both. Take whichever is there. */
  getItemCategories(item) {
    const found = [];

    const readValue = value => {
      if (typeof value === 'string') {
        const name = this.categoryNames.get(value);
        if (name) return name;
        return WMStoreFilter.looksLikeId(value) ? null : value;
      }
      if (value && typeof value === 'object') {
        return (
          value.name ||
          value.title ||
          value.displayName ||
          this.categoryNames.get(value.id) ||
          null
        );
      }
      return null;
    };

    const walk = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 2) return;
      Object.keys(node).forEach(key => {
        const value = node[key];
        if (/categor/i.test(key) && Array.isArray(value)) {
          value.forEach(entry => {
            const name = readValue(entry);
            if (name && found.indexOf(name) === -1) found.push(name);
          });
          return;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          walk(value, depth + 1);
        }
      });
    };

    walk(item, 0);
    return found;
  }

  /* Any list or lookup of categories in the response gives us the wording
     that goes with an id. */
  collectCategoryNames(json) {
    if (!this.categoryNames) this.categoryNames = new Map();

    const record = entry => {
      if (!entry || typeof entry !== 'object') return;
      const name = entry.name || entry.title || entry.displayName;
      if (entry.id && name) this.categoryNames.set(entry.id, String(name).trim());
    };

    const walk = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 4) return;
      Object.keys(node).forEach(key => {
        const value = node[key];
        if (!value || typeof value !== 'object') return;

        if (/categor/i.test(key)) {
          if (Array.isArray(value)) {
            value.forEach(record);
          } else {
            /* A lookup keyed by id, e.g. {"<id>": {name: "Tabs"}} */
            Object.keys(value).forEach(id => {
              const entry = value[id];
              if (!entry || typeof entry !== 'object') return;
              record(Object.assign({id}, entry));
            });
          }
        }

        walk(value, depth + 1);
      });
    };

    walk(json, 0);
  }

  /* One shared in-flight cache for the collection's JSON. The body is read
     straight away so a prefetched response can be handed to whichever call
     asks for it later, however many ask. */
  static requests = new Map();

  static jsonEndpoint(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.set('format', 'json');
      parsed.searchParams.set('nocookie', 'true');
      return `${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
    } catch (error) {
      return '';
    }
  }

  static request(endpoint) {
    if (!WMStoreFilter.requests.has(endpoint)) {
      WMStoreFilter.requests.set(
        endpoint,
        fetch(endpoint, {credentials: 'same-origin'}).then(response =>
          response.text().then(body => ({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            redirected: response.redirected,
            url: response.url,
            body
          }))
        )
      );
    }
    return WMStoreFilter.requests.get(endpoint);
  }

  /* The collection's JSON is the one request the filters cannot start
     without, so it goes out while the page is still parsing rather than
     waiting for DOMContentLoaded and the shell to be built. */
  static prefetch(url) {
    const endpoint = WMStoreFilter.jsonEndpoint(url);
    if (!endpoint) return;
    WMStoreFilter.request(endpoint).catch(() => {});
  }

  static looksLikeId(value) {
    return /^[0-9a-f]{16,32}$/i.test(value);
  }

  getTaxonomyFromNode(node, prefix) {
    const found = [];
    node.classList.forEach(name => {
      if (name.indexOf(`${prefix}-`) !== 0) return;
      const slug = name.slice(prefix.length + 1);
      if (slug) found.push(this.labelForSlug(slug));
    });
    return found;
  }

  /* Item classes are slugs. Recover the real wording from the collection
     context and from any category/tag links Squarespace rendered. */
  labelForSlug(slug) {
    if (!this.slugLabels) this.buildSlugLabels();
    if (this.slugLabels.has(slug)) return this.slugLabels.get(slug);
    return slug.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  buildSlugLabels() {
    this.slugLabels = new Map();
    const add = label => {
      const text = (label || '').trim();
      if (text) this.slugLabels.set(this.slugify(text), text);
    };

    const collection = this.context.collection || {};
    [].concat(collection.categories || [], collection.tags || []).forEach(entry => {
      add(typeof entry === 'string' ? entry : entry && entry.name);
    });

    document
      .querySelectorAll(
        'a[href*="/category/"], a[href*="?category="], a[href*="?tag="], .product-list-category-link'
      )
      .forEach(link => add(link.textContent));
  }

  getNodeKey(node) {
    const id = node.getAttribute('data-product-id') || node.getAttribute('data-item-id');
    if (id) return id;
    const link = node.querySelector('a[href]');
    if (!link) return null;
    return this.normalizeUrl(link.getAttribute('href'));
  }

  /* ================================
     FILTER MODEL
     ================================ */

  buildGroups() {
    const definitions = Array.isArray(this.settings.filters)
      ? this.withPriceGroup(this.settings.filters)
      : this.getAutoDefinitions();

    const usedKeys = new Set();
    this.groups = definitions
      .map(definition => this.buildGroup(definition, usedKeys))
      .filter(Boolean);

    this.reportEmptyGroups(definitions);
  }

  /* A group with nothing in it is silently dropped, which looks like a bug
     from the outside. Say what the collection actually had. */
  reportEmptyGroups(definitions) {
    ['category', 'tag'].forEach(type => {
      const wanted = definitions.some(
        definition => (definition.type || 'category').toLowerCase() === type
      );
      if (!wanted) return;
      if (this.groups.some(group => group.type === type)) return;

      const available = this.getAvailableValues(type);
      console.warn(
        `[${this.pluginName}] No ${type} filter was built. ${
          available.length
            ? `The collection uses these ${type} values: ${available.join(', ')}.`
            : `None of the ${this.entries.length} items in this collection have any ${type === 'tag' ? 'tags' : 'categories'} on them.`
        }`
      );
    });
  }

  /* Listing custom groups says which categories and tags to offer, not that
     the store should lose its price slider. It is appended unless the list
     places one itself, or priceFilter is off. */
  withPriceGroup(definitions) {
    if (this.settings.priceFilter === false) return definitions;
    if (definitions.some(definition => (definition.type || '').toLowerCase() === 'price')) {
      return definitions;
    }
    return [...definitions, {label: this.settings.priceLabel, type: 'price'}];
  }

  getAutoDefinitions() {
    const definitions = [];
    if (this.settings.showCategories) {
      definitions.push({label: this.settings.categoriesLabel, type: 'category'});
    }
    if (this.settings.showTags) {
      definitions.push({label: this.settings.tagsLabel, type: 'tag'});
    }
    definitions.push({label: this.settings.priceLabel, type: 'price'});
    return definitions;
  }

  buildGroup(definition, usedKeys) {
    const type = (definition.type || 'category').toLowerCase();

    if (type === 'price') return this.buildPriceGroup(definition, usedKeys);

    if (type !== 'category' && type !== 'tag') {
      console.warn(
        `[${this.pluginName}] Unknown filter type "${definition.type}". Use "category", "tag" or "price".`
      );
      return null;
    }

    const available = this.getAvailableValues(type);
    if (!available.length) return null;

    let options = available;
    const requested = definition.options;
    if (Array.isArray(requested) && requested.length) {
      const lookup = new Map(available.map(value => [value.toLowerCase(), value]));
      options = [];
      requested.forEach(request => {
        const match = lookup.get(String(request).toLowerCase());
        if (match) {
          options.push(match);
        } else {
          console.warn(
            `[${this.pluginName}] No ${type} named "${request}" exists in this collection — skipping it.`
          );
        }
      });
    }
    if (!options.length) return null;

    const multiSelect =
      definition.multiSelect === undefined ? this.settings.multiSelect : !!definition.multiSelect;

    return {
      key: this.uniqueKey(definition.key || definition.label || type, usedKeys),
      label: definition.label || (type === 'tag' ? this.settings.tagsLabel : this.settings.categoriesLabel),
      type,
      options: options.map(value => ({value, label: value, count: 0})),
      multiSelect,
      style: this.optionStyle(definition),
      match: multiSelect ? (definition.match || this.settings.matchMode).toLowerCase() : 'any',
      collapsible: definition.collapsible === undefined
        ? !!this.settings.collapsible
        : !!definition.collapsible,
      collapsed: definition.startCollapsed === undefined
        ? !!this.settings.startCollapsed
        : !!definition.startCollapsed
    };
  }

  /* A group takes its own style when it names one, the plugin-wide setting
     otherwise. Anything unrecognised falls back to the tick-box list. */
  optionStyle(definition) {
    const wanted = String(
      definition.style || definition.optionStyle || this.settings.optionStyle || 'list'
    ).toLowerCase();

    if (wanted === 'buttons' || wanted === 'button' || wanted === 'pills') return 'buttons';
    if (wanted !== 'list') {
      console.warn(
        `[${this.pluginName}] Unknown filter style "${definition.style || this.settings.optionStyle}". Use "list" or "buttons".`
      );
    }
    return 'list';
  }

  buildPriceGroup(definition, usedKeys) {
    const setting = this.settings.priceFilter;
    if (setting === false) return null;
    if (setting === 'auto' && !this.collection.isProducts) return null;

    const prices = this.entries.filter(entry => entry.price);
    if (prices.length < 2) return null;

    const min = Math.min(...prices.map(entry => entry.price.min));
    const max = Math.max(...prices.map(entry => entry.price.max));
    if (!(max > min)) return null;

    const currency = prices.find(entry => entry.price.currency);
    const step = this.getPriceStep(max - min);

    this.priceRange = {
      min: Math.floor(min / step) * step,
      max: Math.ceil(max / step) * step,
      step,
      currency: currency ? currency.price.currency : null
    };

    return {
      key: this.uniqueKey(definition.key || definition.label || 'price', usedKeys),
      label: definition.label || this.settings.priceLabel,
      type: 'price',
      options: [],
      multiSelect: false,
      match: 'any',
      /* A slider is two lines tall — collapsing it earns nothing, so no arrow. */
      collapsible: definition.collapsible === undefined ? false : !!definition.collapsible,
      collapsed: definition.startCollapsed === undefined ? false : !!definition.startCollapsed
    };
  }

  getPriceStep(range) {
    if (range <= 10) return 0.5;
    if (range <= 100) return 1;
    if (range <= 1000) return 5;
    if (range <= 10000) return 50;
    return 100;
  }

  getAvailableValues(type) {
    const seen = new Map();
    this.entries.forEach(entry => {
      const values = type === 'tag' ? entry.tags : entry.categories;
      values.forEach(value => {
        const key = value.toLowerCase();
        if (!seen.has(key)) seen.set(key, value);
      });
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, {sensitivity: 'base'})
    );
  }

  uniqueKey(source, usedKeys) {
    const base = this.slugify(source) || 'filter';
    let key = base;
    let index = 2;
    while (usedKeys.has(key)) {
      key = `${base}-${index}`;
      index += 1;
    }
    usedKeys.add(key);
    return key;
  }

  /* ================================
     SHELL
     ================================ */

  buildShell() {
    const container = this.list.container;
    const position = this.position;

    this.root = document.createElement('div');
    this.root.className = 'wm-store-filter is-loading';
    this.root.setAttribute('data-wm-plugin', WMStoreFilter.pluginName);
    this.root.setAttribute('data-position', position);
    this.root.setAttribute('data-layout', this.list.layout);

    this.root.innerHTML = `
      <div class="wm-store-filter-layout">
        <div class="wm-store-filter-backdrop" hidden></div>
        <aside class="wm-store-filter-panel" aria-label="${this.escape(this.settings.filtersTitle)}">
          <div class="wm-store-filter-panel-header">
            <p class="wm-store-filter-panel-title">${this.escape(this.settings.filtersTitle)}</p>
            <button type="button" class="wm-store-filter-close" aria-label="Close filters">
              ${WMStoreFilter.icons.close}
            </button>
          </div>
          <div class="wm-store-filter-panel-body">
            <p class="wm-store-filter-loading">${this.escape(this.settings.loadingText)}</p>
          </div>
          <div class="wm-store-filter-panel-footer">
            <button type="button" class="wm-store-filter-clear wm-store-filter-button-secondary">
              ${this.escape(this.settings.clearText)}
            </button>
            <button type="button" class="wm-store-filter-apply sqs-button-element--primary"></button>
          </div>
        </aside>
        <div class="wm-store-filter-content">
          <div class="wm-store-filter-toolbar">
            <button type="button" class="wm-store-filter-mobile-toggle" aria-expanded="false">
              <span class="wm-store-filter-mobile-toggle-icon">${WMStoreFilter.icons.filter}</span>
              <span class="wm-store-filter-mobile-toggle-text">${this.escape(this.settings.filterButtonText)}</span>
            </button>
            <p class="wm-store-filter-count" aria-live="polite"></p>
          </div>
          <div class="wm-store-filter-empty" hidden>
            <p class="wm-store-filter-empty-title">${this.escape(this.settings.noResultsTitle)}</p>
            <p class="wm-store-filter-empty-text">${this.escape(this.settings.noResultsText)}</p>
          </div>
          <nav class="wm-store-filter-pagination" aria-label="Pagination" hidden></nav>
        </div>
      </div>
    `;

    container.parentNode.insertBefore(this.root, container);

    this.elements = {
      layout: this.root.querySelector('.wm-store-filter-layout'),
      backdrop: this.root.querySelector('.wm-store-filter-backdrop'),
      panel: this.root.querySelector('.wm-store-filter-panel'),
      panelBody: this.root.querySelector('.wm-store-filter-panel-body'),
      footer: this.root.querySelector('.wm-store-filter-panel-footer'),
      close: this.root.querySelector('.wm-store-filter-close'),
      clear: this.root.querySelector('.wm-store-filter-clear'),
      apply: this.root.querySelector('.wm-store-filter-apply'),
      content: this.root.querySelector('.wm-store-filter-content'),
      toolbar: this.root.querySelector('.wm-store-filter-toolbar'),
      toggle: this.root.querySelector('.wm-store-filter-mobile-toggle'),
      count: this.root.querySelector('.wm-store-filter-count'),
      empty: this.root.querySelector('.wm-store-filter-empty'),
      pagination: this.root.querySelector('.wm-store-filter-pagination')
    };

    /* The native grid keeps every one of its own classes and inline custom
       properties, so the section's layout settings still drive the items. */
    this.elements.content.insertBefore(container, this.elements.empty);

    this.hideNativeInterface();
    this.syncVariant();

    /* Keep the section as Squarespace rendered it, so the editor can be
       handed the original markup back untouched. */
    this.originalNodes = this.getNativeNodes();
    /* 'auto' pagination mirrors however many items the section itself shows. */
    this.nativePageSize = this.originalNodes.length;
  }

  /* --navigationLinkColor is defined per section theme, so inside the
     collection's own section it resolves to that section's accent rather than
     the colour the header links actually use. Read the rendered colour off a
     real nav link and hand it to the CSS as the default. */
  applyNavigationColor() {
    const link = document.querySelector(
      '#header .header-nav-item > a, #header .header-nav-list a, .header-nav-item a, #header .header-nav a'
    );
    let color = link ? window.getComputedStyle(link).color : '';

    if (!color || color === 'rgba(0, 0, 0, 0)') {
      const header = document.querySelector('#header');
      color = header
        ? window.getComputedStyle(header).getPropertyValue('--navigationLinkColor').trim()
        : '';
    }

    if (color) this.root.style.setProperty('--wm-store-filter-nav-color', color);
  }

  /* Only a header that stays put is worth sitting below. A static header
     scrolls away, so reserving its height would leave a permanent gap above
     the filters. */
  applyStickyOffset() {
    if (!this.root) return;

    const header = document.querySelector('#header') || document.querySelector('.header');
    let offset = 0;

    if (header) {
      const position = window.getComputedStyle(header).position;
      if (position === 'fixed' || position === 'sticky') {
        offset = header.getBoundingClientRect().height;
      }
    }

    this.root.style.setProperty(
      '--wm-store-filter-header-offset',
      `${Math.round(offset)}px`
    );
  }

  /* The section's content is usually inset further than the header is, which
     leaves the sidebar floating in from the logo. Measure the gap and hand it
     to the CSS so the filters start on the same line as the logo. */
  alignToLogo() {
    if (!this.root) return;

    const clear = () => this.root.style.setProperty('--wm-store-filter-edge-offset', '0px');
    if (this.position !== 'side' || this.isMobile) {
      clear();
      return;
    }

    const logo = document.querySelector(
      '#header .header-title-logo img, #header .header-title-logo a, #header .header-title-text a, #header .header-title'
    );
    if (!logo) return;

    /* Measure from a clean slate or each pass would stack on the last. */
    clear();
    const logoLeft = logo.getBoundingClientRect().left;
    const layoutLeft = this.elements.layout.getBoundingClientRect().left;
    const offset = layoutLeft - logoLeft;

    /* A centred logo is not an edge to line up with. */
    if (offset <= 1 || logoLeft > window.innerWidth / 3) return;

    this.root.style.setProperty('--wm-store-filter-edge-offset', `${Math.round(offset)}px`);
  }

  /* The editor adds sqs-edit-mode-active after this script has run, so the
     plugin can already be in place by the time editing starts. Give the
     section back the moment that happens — the layout controls only work on
     Squarespace's own markup, in its own place. */
  watchForEditor() {
    if (!window.MutationObserver) return;

    this.editorObserver = new MutationObserver(() => {
      if (!document.body.classList.contains('sqs-edit-mode-active')) return;
      this.editorObserver.disconnect();
      this.handOverToEditor();
    });

    this.editorObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  handOverToEditor() {
    if (!this.root) return;
    this.removeGlobalListeners();
    this.restoreNativeList(this.originalNodes);
    this.teardownShell();
    this.hasLoaded = false;
    document.documentElement.classList.remove('wm-store-filter-locked');
    WMStoreFilter.emitEvent(':destroy', {instance: this, reason: 'edit-mode'});
  }

  /* Put the given nodes back in the collection's own container, in order. */
  restoreNativeList(nodes) {
    const container = this.list.container;
    const fragment = document.createDocumentFragment();

    this.getNativeNodes().forEach(node => node.remove());
    (nodes || []).forEach(node => {
      delete node.dataset.wmStoreFilterReady;
      fragment.appendChild(node);
    });
    container.appendChild(fragment);
  }

  removeGlobalListeners() {
    document.removeEventListener('click', this.onDocumentClick);
    document.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('resize', this.onResize);
  }

  hideNativeInterface() {
    const section = this.root.closest('section, .sqs-block-summary-v2') || document;
    const selectors = [
      '.product-list-filters-container',
      '.product-list-filters-drawer-open-button-container',
      '.product-list-filters-drawer-overlay',
      '.product-list-result-count-container',
      '.product-list-category-subnav-container',
      '.product-list-category-select-container',
      '.product-list-no-results',
      '.pagination',
      'nav.pagination'
    ];
    this.hiddenNative = [];
    selectors.forEach(selector => {
      section.querySelectorAll(selector).forEach(element => {
        if (this.root.contains(element)) return;
        element.classList.add('wm-store-filter-native-hidden');
        this.hiddenNative.push(element);
      });
    });
  }

  teardownShell() {
    if (!this.root) return;
    const container = this.list.container;
    this.root.parentNode.insertBefore(container, this.root);
    (this.hiddenNative || []).forEach(element =>
      element.classList.remove('wm-store-filter-native-hidden')
    );
    this.root.remove();
    this.root = null;
  }

  /* ================================
     PANEL
     ================================ */

  buildPanel() {
    const body = this.elements.panelBody;
    body.innerHTML = '';

    const search = this.settings.search ? this.buildSearch() : null;
    if (search && this.searchPosition === 'beginning') body.appendChild(search);
    this.groups.forEach(group => body.appendChild(this.buildGroupElement(group)));
    if (search && this.searchPosition === 'end') body.appendChild(search);

    this.elements.search = body.querySelector('.wm-store-filter-search-input');
    if (this.elements.search) this.elements.search.value = this.state.search;
    this.syncControls();
  }

  buildSearch() {
    const wrapper = document.createElement('div');
    wrapper.className = 'wm-store-filter-search';
    wrapper.setAttribute('role', 'search');
    const id = `wm-store-filter-search-${Math.random().toString(36).slice(2, 8)}`;
    wrapper.innerHTML = `
      <label class="wm-store-filter-visually-hidden" for="${id}">${this.escape(
      this.settings.searchLabel
    )}</label>
      <span class="wm-store-filter-search-icon">${WMStoreFilter.icons.search}</span>
      <input type="search" id="${id}" class="wm-store-filter-search-input" placeholder="${this.escape(
      this.settings.searchPlaceholder
    )}" autocomplete="off">
    `;
    return wrapper;
  }

  buildGroupElement(group) {
    const element = document.createElement('div');
    element.className = 'wm-store-filter-group';
    element.dataset.key = group.key;
    element.dataset.type = group.type;
    element.dataset.style = group.style || 'list';
    element.dataset.collapsible = String(group.collapsible);
    if (group.collapsed && group.collapsible) element.classList.add('is-collapsed');

    const panelId = `wm-store-filter-${group.key}-${Math.random().toString(36).slice(2, 8)}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'wm-store-filter-group-toggle';
    toggle.setAttribute('aria-expanded', String(!group.collapsed));
    toggle.setAttribute('aria-controls', panelId);
    toggle.innerHTML = `
      <span class="wm-store-filter-group-label">${this.escape(group.label)}</span>
      <span class="wm-store-filter-group-selected"></span>
      <span class="wm-store-filter-group-chevron">${WMStoreFilter.icons.chevron}</span>
    `;

    const panel = document.createElement('div');
    panel.className = 'wm-store-filter-group-panel';
    panel.id = panelId;
    panel.appendChild(
      group.type === 'price' ? this.buildPriceControl(group) : this.buildOptionList(group)
    );

    element.appendChild(toggle);
    element.appendChild(panel);
    return element;
  }

  buildOptionList(group) {
    const list = document.createElement('ul');
    list.className = 'wm-store-filter-options';
    const inputType = group.multiSelect ? 'checkbox' : 'radio';
    const name = `wm-store-filter-${group.key}`;

    const options = group.multiSelect
      ? group.options
      : [{value: '', label: `All ${group.label}`, count: null}, ...group.options];

    options.forEach(option => {
      const item = document.createElement('li');
      item.className = 'wm-store-filter-option-item';
      item.innerHTML = `
        <label class="wm-store-filter-option">
          <input type="${inputType}" name="${name}" value="${this.escape(option.value)}" class="wm-store-filter-input">
          <span class="wm-store-filter-option-box" aria-hidden="true"></span>
          <span class="wm-store-filter-option-label">${this.escape(option.label)}</span>
          <span class="wm-store-filter-option-count"${
            this.settings.showOptionCounts && option.value ? '' : ' hidden'
          }></span>
        </label>
      `;
      list.appendChild(item);
    });

    return list;
  }

  buildPriceControl(group) {
    const {min, max, step} = this.priceRange;
    const wrapper = document.createElement('div');
    wrapper.className = 'wm-store-filter-price';
    wrapper.innerHTML = `
      <div class="wm-store-filter-price-values">
        <span class="wm-store-filter-price-value" data-bound="min"></span>
        <span class="wm-store-filter-price-value" data-bound="max"></span>
      </div>
      <div class="wm-store-filter-price-slider">
        <span class="wm-store-filter-price-track"></span>
        <span class="wm-store-filter-price-fill"></span>
        <input type="range" class="wm-store-filter-price-input" data-bound="min"
          min="${min}" max="${max}" step="${step}" value="${min}"
          aria-label="${this.escape(group.label)} minimum">
        <input type="range" class="wm-store-filter-price-input" data-bound="max"
          min="${min}" max="${max}" step="${step}" value="${max}"
          aria-label="${this.escape(group.label)} maximum">
      </div>
    `;
    return wrapper;
  }

  /* ================================
     STATE
     ================================ */

  getSelection(key) {
    if (!this.state.groups[key]) this.state.groups[key] = [];
    return this.state.groups[key];
  }

  isFullPriceRange(price) {
    if (!price || !this.priceRange) return true;
    return price.min <= this.priceRange.min && price.max >= this.priceRange.max;
  }

  getActiveFilterCount() {
    let count = this.groups.reduce(
      (total, group) => total + (this.state.groups[group.key] || []).length,
      0
    );
    if (this.state.price && !this.isFullPriceRange(this.state.price)) count += 1;
    return count;
  }

  hasActiveState() {
    return !!this.state.search.trim() || this.getActiveFilterCount() > 0;
  }

  clearState() {
    this.state.search = '';
    this.state.groups = {};
    this.state.price = null;
    this.state.page = 1;
    if (this.elements.search) this.elements.search.value = '';
    this.syncControls();
    this.render();
  }

  /* Push every value in `state` back onto the inputs — used after a clear,
     after reading the URL, and when the panel is rebuilt. */
  syncControls() {
    this.groups.forEach(group => {
      const element = this.elements.panelBody.querySelector(
        `.wm-store-filter-group[data-key="${group.key}"]`
      );
      if (!element) return;

      if (group.type === 'price') {
        const price = this.state.price || {min: this.priceRange.min, max: this.priceRange.max};
        const minInput = element.querySelector('input[data-bound="min"]');
        const maxInput = element.querySelector('input[data-bound="max"]');
        if (minInput) minInput.value = price.min;
        if (maxInput) maxInput.value = price.max;
        this.updatePriceDisplay(element);
        return;
      }

      const selected = (this.state.groups[group.key] || []).map(value => value.toLowerCase());
      element.querySelectorAll('.wm-store-filter-input').forEach(input => {
        input.checked = input.value
          ? selected.includes(input.value.toLowerCase())
          : selected.length === 0;
      });
      this.updateGroupSummary(group, element);
    });
  }

  updateGroupSummary(group, element) {
    const summary = element.querySelector('.wm-store-filter-group-selected');
    if (!summary) return;

    if (group.type === 'price') {
      const active = this.state.price && !this.isFullPriceRange(this.state.price);
      summary.textContent = active
        ? `${this.formatPrice(this.state.price.min)} – ${this.formatPrice(this.state.price.max)}`
        : '';
      element.classList.toggle('has-selection', !!active);
      return;
    }

    const selected = this.state.groups[group.key] || [];
    summary.textContent = selected.length === 1 ? selected[0] : selected.length ? `${selected.length}` : '';
    element.classList.toggle('has-selection', selected.length > 0);
  }

  updatePriceDisplay(element) {
    const minInput = element.querySelector('input[data-bound="min"]');
    const maxInput = element.querySelector('input[data-bound="max"]');
    if (!minInput || !maxInput) return;

    const min = parseFloat(minInput.value);
    const max = parseFloat(maxInput.value);
    /* Ratios, not percentages — the CSS measures them along the thumb's own
       travel, which is inset by half a thumb at each end. */
    const span = this.priceRange.max - this.priceRange.min || 1;
    const ratio = value => Math.min(1, Math.max(0, (value - this.priceRange.min) / span));

    const slider = element.querySelector('.wm-store-filter-price-slider');
    if (slider) {
      slider.style.setProperty('--wm-store-filter-price-start', ratio(min));
      slider.style.setProperty('--wm-store-filter-price-end', ratio(max));
    }

    const minLabel = element.querySelector('.wm-store-filter-price-value[data-bound="min"]');
    const maxLabel = element.querySelector('.wm-store-filter-price-value[data-bound="max"]');
    if (minLabel) minLabel.textContent = this.formatPrice(min);
    if (maxLabel) maxLabel.textContent = this.formatPrice(max);
  }

  /* ================================
     MATCHING
     ================================ */

  matchesSearch(entry) {
    const term = this.state.search.trim().toLowerCase();
    if (!term) return true;
    return term
      .split(/\s+/)
      .every(word => entry.searchText.includes(word));
  }

  matchesGroup(entry, group) {
    if (group.type === 'price') {
      const price = this.state.price;
      if (!price || this.isFullPriceRange(price)) return true;
      if (!entry.price) return false;
      return entry.price.min <= price.max && entry.price.max >= price.min;
    }

    const selected = this.state.groups[group.key] || [];
    if (!selected.length) return true;

    const values = (group.type === 'tag' ? entry.tags : entry.categories).map(value =>
      value.toLowerCase()
    );
    const wanted = selected.map(value => value.toLowerCase());
    return group.match === 'all'
      ? wanted.every(value => values.includes(value))
      : wanted.some(value => values.includes(value));
  }

  getMatches(exceptKey = null) {
    return this.entries.filter(entry => {
      if (!this.matchesSearch(entry)) return false;
      return this.groups.every(group =>
        group.key === exceptKey ? true : this.matchesGroup(entry, group)
      );
    });
  }

  /* ================================
     RENDER
     ================================ */

  getPerPage() {
    const setting = this.settings.pagination.itemsPerPage;
    if (setting === 'auto' || setting === undefined || setting === null) {
      return this.nativePageSize || 12;
    }
    const value = parseInt(setting, 10);
    return Number.isNaN(value) || value < 1 ? this.entries.length : value;
  }

  isPaginated() {
    return this.settings.pagination.enabled && this.settings.pagination.type !== 'none';
  }

  render() {
    if (!this.root) return;
    const matches = this.getMatches();
    const perPage = this.getPerPage();
    const totalPages = this.isPaginated() ? Math.max(1, Math.ceil(matches.length / perPage)) : 1;

    if (this.state.page > totalPages) this.state.page = totalPages;
    if (this.state.page < 1) this.state.page = 1;

    let visible = matches;
    if (this.isPaginated()) {
      visible =
        this.settings.pagination.type === 'loadMore'
          ? matches.slice(0, this.state.page * perPage)
          : matches.slice((this.state.page - 1) * perPage, this.state.page * perPage);
    }

    this.renderItems(visible);
    this.renderPagination(matches.length, totalPages);
    this.updateCounts(matches.length);
    this.updateOptionCounts();

    this.elements.empty.hidden = matches.length > 0;
    this.root.classList.toggle('is-empty', matches.length === 0);

    WMStoreFilter.emitEvent(':filtered', {
      instance: this,
      matches: matches.length,
      total: this.entries.length,
      page: this.state.page
    });
  }

  renderItems(visible) {
    const container = this.list.container;
    const fragment = document.createDocumentFragment();

    this.getNativeNodes().forEach(node => node.remove());
    visible.forEach(entry => fragment.appendChild(entry.node));
    container.appendChild(fragment);

    const fresh = visible.filter(entry => !entry.node.dataset.wmStoreFilterReady);
    fresh.forEach(entry => {
      entry.node.dataset.wmStoreFilterReady = 'true';
    });
    if (fresh.length) this.hydrateNodes(fresh.map(entry => entry.node));
  }

  renderPagination(total, totalPages) {
    const nav = this.elements.pagination;
    const {type, loadMoreText, previousText, nextText} = this.settings.pagination;

    if (!this.isPaginated() || totalPages <= 1) {
      nav.hidden = true;
      nav.innerHTML = '';
      return;
    }

    nav.hidden = false;
    nav.dataset.type = type;

    if (type === 'loadMore') {
      const remaining = total - this.state.page * this.getPerPage();
      if (remaining <= 0) {
        nav.hidden = true;
        nav.innerHTML = '';
        return;
      }
      nav.innerHTML = `
        <button type="button" class="wm-store-filter-load-more sqs-button-element--primary" data-action="load-more">
          ${this.escape(loadMoreText)}
        </button>
      `;
      return;
    }

    const current = this.state.page;
    const buttons = this.getPageNumbers(current, totalPages)
      .map(page => {
        if (page === '…') {
          return '<span class="wm-store-filter-page-gap">…</span>';
        }
        const isCurrent = page === current;
        return `
          <button type="button" class="wm-store-filter-page${
            isCurrent ? ' is-current' : ''
          }" data-page="${page}"${isCurrent ? ' aria-current="page"' : ''}>${page}</button>
        `;
      })
      .join('');

    nav.innerHTML = `
      <button type="button" class="wm-store-filter-page-arrow" data-page="${current - 1}"
        aria-label="${this.escape(previousText)}"${current === 1 ? ' disabled' : ''}>
        ${WMStoreFilter.icons.arrowLeft}
      </button>
      <div class="wm-store-filter-pages">${buttons}</div>
      <button type="button" class="wm-store-filter-page-arrow" data-page="${current + 1}"
        aria-label="${this.escape(nextText)}"${current === totalPages ? ' disabled' : ''}>
        ${WMStoreFilter.icons.arrowRight}
      </button>
    `;
  }

  getPageNumbers(current, total) {
    if (total <= 7) return Array.from({length: total}, (unused, index) => index + 1);
    const pages = new Set([1, total, current, current - 1, current + 1]);
    if (current <= 3) [2, 3, 4].forEach(page => pages.add(page));
    if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(page => pages.add(page));

    const sorted = Array.from(pages)
      .filter(page => page >= 1 && page <= total)
      .sort((a, b) => a - b);

    const output = [];
    sorted.forEach((page, index) => {
      if (index > 0 && page - sorted[index - 1] > 1) output.push('…');
      output.push(page);
    });
    return output;
  }

  updateCounts(total) {
    const template =
      total === 1 ? this.settings.resultCountSingularText : this.settings.resultCountText;
    const label = String(template).replace('{count}', total);

    if (this.settings.showResultCount) {
      this.elements.count.textContent = label;
      this.elements.count.hidden = false;
    } else {
      this.elements.count.hidden = true;
    }

    this.elements.apply.textContent = String(this.settings.applyText).replace('{count}', total);

    this.elements.clear.hidden = !this.hasActiveState();
    this.root.classList.toggle('has-active-filters', this.hasActiveState());
  }

  /* Counts shown next to each option ignore that option's own group, so
     ticking one box doesn't zero out its siblings. */
  updateOptionCounts() {
    this.groups.forEach(group => {
      const element = this.elements.panelBody.querySelector(
        `.wm-store-filter-group[data-key="${group.key}"]`
      );
      if (!element) return;
      this.updateGroupSummary(group, element);
      if (group.type === 'price' || !this.settings.showOptionCounts) return;

      const pool = this.getMatches(group.key);
      const counts = new Map();
      group.options.forEach(option => {
        const value = option.value.toLowerCase();
        const count = pool.filter(entry =>
          (group.type === 'tag' ? entry.tags : entry.categories).some(
            item => item.toLowerCase() === value
          )
        ).length;
        option.count = count;
        counts.set(value, count);
      });

      element.querySelectorAll('.wm-store-filter-input').forEach(input => {
        if (!input.value) return;
        const count = counts.get(input.value.toLowerCase());
        if (count === undefined) return;
        const label = input.closest('.wm-store-filter-option');
        const counter = label.querySelector('.wm-store-filter-option-count');
        if (counter) counter.textContent = count;
        label.classList.toggle('is-empty', count === 0 && !input.checked);
      });
    });
  }

  /* ================================
     EVENTS
     ================================ */

  bindEvents() {
    const body = this.elements.panelBody;

    this.onPanelChange = event => {
      const input = event.target.closest('.wm-store-filter-input');
      if (!input) return;
      this.handleOptionChange(input);
    };

    this.onPanelInput = event => {
      if (event.target.closest('.wm-store-filter-search-input')) {
        this.debouncedSearch(event.target.value);
        return;
      }
      if (event.target.closest('.wm-store-filter-price-input')) {
        this.handlePriceInput(event.target);
      }
    };

    this.onPanelClick = event => {
      const toggle = event.target.closest('.wm-store-filter-group-toggle');
      if (toggle) this.toggleGroup(toggle.closest('.wm-store-filter-group'));
    };

    body.addEventListener('change', this.onPanelChange);
    body.addEventListener('input', this.onPanelInput);
    body.addEventListener('click', this.onPanelClick);

    this.elements.toggle.addEventListener('click', () => this.openDrawer());
    this.elements.close.addEventListener('click', () => this.closeDrawer());
    this.elements.backdrop.addEventListener('click', () => this.closeDrawer());
    this.elements.apply.addEventListener('click', () => this.closeDrawer());
    this.elements.clear.addEventListener('click', () => this.clearState());

    this.onPaginationClick = event => {
      const loadMore = event.target.closest('[data-action="load-more"]');
      if (loadMore) {
        this.state.page += 1;
        this.render();
        return;
      }
      const page = event.target.closest('[data-page]');
      if (!page || page.disabled) return;
      const value = parseInt(page.dataset.page, 10);
      if (Number.isNaN(value)) return;
      this.state.page = value;
      this.render();
      this.scrollToTop();
    };
    this.elements.pagination.addEventListener('click', this.onPaginationClick);

    /* The root wraps the products as well as the filters, so "outside" means
       outside the dropdown itself — clicking a product, the search box or the
       page closes it. A click on a group is left to toggleGroup. */
    this.onDocumentClick = event => {
      if (!this.isDropdownVariant()) return;
      const target = event.target;
      const group = target && target.closest ? target.closest('.wm-store-filter-group') : null;
      if (group && this.root.contains(group)) return;
      this.closeDropdowns();
    };
    document.addEventListener('click', this.onDocumentClick);

    this.onKeydown = event => {
      if (event.key !== 'Escape') return;
      if (this.isDrawerOpen) this.closeDrawer();
      else this.closeDropdowns();
    };
    document.addEventListener('keydown', this.onKeydown);

    this.onResize = this.debounce(() => {
      const wasMobile = this.isMobile;
      this.isMobile = this.getIsMobile();
      this.applyStickyOffset();
      this.alignToLogo();
      if (this.isDrawerOpen) this.updateDrawerOffset();
      if (wasMobile === this.isMobile) return;
      if (!this.usesDrawer) this.closeDrawer();
      this.closeDropdowns();
      this.syncVariant();
    }, 150);
    window.addEventListener('resize', this.onResize);

    this.debouncedSearch = this.debounce(value => {
      this.state.search = value;
      this.state.page = 1;
      this.render();
    }, 200);

    this.debouncedPriceRender = this.debounce(() => this.render(), 150);
  }

  handleOptionChange(input) {
    const element = input.closest('.wm-store-filter-group');
    const group = this.groups.find(item => item.key === element.dataset.key);
    if (!group) return;

    if (group.multiSelect) {
      const selected = this.getSelection(group.key);
      const index = selected.findIndex(
        value => value.toLowerCase() === input.value.toLowerCase()
      );
      if (input.checked && index === -1) selected.push(input.value);
      if (!input.checked && index > -1) selected.splice(index, 1);
    } else {
      this.state.groups[group.key] = input.value ? [input.value] : [];
    }

    this.state.page = 1;
    this.updateGroupSummary(group, element);
    this.render();
  }

  handlePriceInput(input) {
    const element = input.closest('.wm-store-filter-group');
    const minInput = element.querySelector('input[data-bound="min"]');
    const maxInput = element.querySelector('input[data-bound="max"]');
    const step = this.priceRange.step;

    let min = parseFloat(minInput.value);
    let max = parseFloat(maxInput.value);

    /* Keep the two thumbs from crossing over each other. */
    if (min > max - step) {
      if (input === minInput) {
        min = Math.max(this.priceRange.min, max - step);
        minInput.value = min;
      } else {
        max = Math.min(this.priceRange.max, min + step);
        maxInput.value = max;
      }
    }

    this.state.price = {min, max};
    this.state.page = 1;
    this.updatePriceDisplay(element);
    this.debouncedPriceRender();
  }

  toggleGroup(element) {
    if (!element) return;
    const toggle = element.querySelector('.wm-store-filter-group-toggle');

    if (this.isDropdownVariant()) {
      const isOpen = element.classList.contains('is-open');
      this.closeDropdowns();
      element.classList.toggle('is-open', !isOpen);
      toggle.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) this.keepDropdownOnScreen(element);
      return;
    }

    const group = this.groups.find(item => item.key === element.dataset.key);
    if (!group || !group.collapsible) return;
    const isCollapsed = element.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
  }

  /* A dropdown hangs from the left of its pill, which sends the ones near the
     right edge off screen — and on a narrow screen no edge of the pill works.
     Measure the open one and slide it along until it sits inside the viewport,
     which leaves it under its pill wherever there is room. */
  keepDropdownOnScreen(element) {
    const panel = element.querySelector('.wm-store-filter-group-panel');
    if (!panel) return;

    panel.style.left = '';
    const margin = 8;
    const room = document.documentElement.clientWidth;
    const box = panel.getBoundingClientRect();
    const wanted = Math.max(margin, Math.min(box.left, room - box.width - margin));
    const shift = Math.round(wanted - box.left);

    if (shift) panel.style.left = `${shift}px`;
  }

  closeDropdowns() {
    this.root.querySelectorAll('.wm-store-filter-group.is-open').forEach(element => {
      element.classList.remove('is-open');
      const panel = element.querySelector('.wm-store-filter-group-panel');
      if (panel) panel.style.left = '';
      const toggle = element.querySelector('.wm-store-filter-group-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  openDrawer() {
    if (this.isDrawerOpen) return;
    this.updateDrawerOffset();
    this.isDrawerOpen = true;
    this.root.classList.add('is-drawer-open');
    this.elements.backdrop.hidden = false;
    this.elements.toggle.setAttribute('aria-expanded', 'true');
    this.elements.panel.removeAttribute('inert');
    this.elements.panel.removeAttribute('aria-hidden');
    document.documentElement.classList.add('wm-store-filter-locked');
    window.requestAnimationFrame(() => this.elements.close.focus());
    WMStoreFilter.emitEvent(':drawerOpen', {instance: this});
  }

  closeDrawer() {
    if (!this.isDrawerOpen) return;
    this.isDrawerOpen = false;
    this.root.classList.remove('is-drawer-open');
    this.elements.backdrop.hidden = true;
    this.elements.toggle.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('wm-store-filter-locked');
    this.syncVariant();
    if (this.usesDrawer) this.elements.toggle.focus();
    WMStoreFilter.emitEvent(':drawerClose', {instance: this});
  }

  /* The drawer opens under the header rather than over it. Measure how much
     of the header is actually on screen — a header that has scrolled away
     leaves nothing to sit below. */
  updateDrawerOffset() {
    if (!this.root) return;

    const header = document.querySelector('#header') || document.querySelector('.header');
    let offset = 0;

    if (header) {
      const rect = header.getBoundingClientRect();
      offset = Math.max(0, Math.min(rect.height, rect.bottom));
    }

    this.root.style.setProperty('--wm-store-filter-drawer-top', `${Math.round(offset)}px`);
  }

  /* 'side' names where the filters sit; 'left' was the old spelling for it
     and still works. Anything else falls back to the side panel. */
  get position() {
    const wanted = String(this.settings.position || 'side').toLowerCase();
    return wanted === 'top' ? 'top' : 'side';
  }

  /* How the row of pills sits across the bar in the top layout. 'spread'
     pushes the search box away from the groups, to whichever end it is not
     already on. */
  get topAlignment() {
    const wanted = String(this.settings.topAlignment || 'spread').toLowerCase();
    if (wanted === 'right' || wanted === 'end') return 'right';
    if (wanted === 'center' || wanted === 'centre' || wanted === 'middle') return 'center';
    if (wanted === 'spread' || wanted === 'between') return 'spread';
    if (wanted !== 'left' && wanted !== 'start') {
      console.warn(
        `[${this.pluginName}] Unknown topAlignment "${this.settings.topAlignment}". Use "left", "right", "center" or "spread".`
      );
    }
    return 'left';
  }

  /* Where the search box sits among the filter groups. */
  get searchPosition() {
    const wanted = String(this.settings.searchPosition || 'beginning').toLowerCase();
    if (wanted === 'end' || wanted === 'bottom' || wanted === 'last') return 'end';
    if (wanted !== 'beginning' && wanted !== 'start' && wanted !== 'top' && wanted !== 'first') {
      console.warn(
        `[${this.pluginName}] Unknown searchPosition "${this.settings.searchPosition}". Use "beginning" or "end".`
      );
    }
    return 'beginning';
  }

  /* Small screens get the slide-out drawer unless the store asks for the row
     of dropdowns instead. */
  get mobileLayout() {
    return String(this.settings.mobileLayout || 'drawer').toLowerCase() === 'top'
      ? 'top'
      : 'drawer';
  }

  /* The drawer is what makes a screen "mobile" as far as the layout is
     concerned — in the top mobile layout there is no drawer to open. */
  get usesDrawer() {
    return this.isMobile && this.mobileLayout === 'drawer';
  }

  syncVariant() {
    const isDropdown = this.isMobile ? this.mobileLayout === 'top' : this.position === 'top';
    this.root.setAttribute('data-variant', isDropdown ? 'dropdown' : 'panel');
    this.root.setAttribute('data-align', this.topAlignment);
    this.setMobileState();
    this.placeResultCount();

    if (this.usesDrawer && !this.isDrawerOpen) {
      this.elements.panel.setAttribute('inert', '');
      this.elements.panel.setAttribute('aria-hidden', 'true');
    } else {
      this.elements.panel.removeAttribute('inert');
      this.elements.panel.removeAttribute('aria-hidden');
    }
  }

  /* The sidebar and the drawer are different layouts, not two ends of an
     animation. Drop the drawer's transition, let the new layout land, then
     arm it again so real opens and closes still slide. */
  setMobileState() {
    if (this.root.classList.contains('is-mobile') === this.usesDrawer) return;

    this.root.classList.remove('is-drawer-ready');
    this.root.classList.toggle('is-mobile', this.usesDrawer);
    /* Reading a layout property commits the new position untransitioned. */
    void this.root.offsetHeight;
    if (this.usesDrawer) this.root.classList.add('is-drawer-ready');
  }

  /* In the sidebar layout the count belongs at the foot of the filters.
     Everywhere else — the top bar, and the mobile drawer — it sits beside
     the Filter button above the items. */
  placeResultCount() {
    const count = this.elements.count;
    if (!count) return;

    const inSidebar = !this.isMobile && this.position === 'side';
    const target = inSidebar ? this.elements.footer : this.elements.toolbar;
    if (!target || count.parentElement === target) return;

    if (inSidebar) target.insertBefore(count, target.firstChild);
    else target.appendChild(count);
  }

  isDropdownVariant() {
    return this.root.getAttribute('data-variant') === 'dropdown';
  }

  getIsMobile() {
    return window.matchMedia(`(max-width: ${this.settings.mobileBreakpoint}px)`).matches;
  }

  scrollToTop() {
    if (!this.settings.pagination.scrollToTop) return;
    const header = document.querySelector('#header');
    const offset = header ? header.offsetHeight : 0;
    const top = this.root.getBoundingClientRect().top + window.scrollY - offset - 20;
    window.scrollTo({top: Math.max(top, 0), behavior: 'smooth'});
  }

  /* ================================
     SQUARESPACE HYDRATION
     ================================ */

  hydrateNodes(nodes) {
    const loader = window.ImageLoader || (window.Squarespace && window.Squarespace.ImageLoader);
    nodes.forEach(node => {
      node.querySelectorAll('img[data-src]').forEach(image => {
        if (loader && typeof loader.load === 'function') {
          loader.load(image, {load: true});
        } else if (!image.getAttribute('src')) {
          image.setAttribute('src', image.getAttribute('data-src'));
        }
      });
    });
    this.reinitializeSquarespace();
  }

  /* Items pulled in from later pages of the collection were never seen by
     Squarespace's own controllers, so give the commerce bindings and any
     other Will-Myers plugins a chance to pick them up. */
  reinitializeSquarespace() {
    try {
      if (window.Squarespace && window.Y && typeof window.Squarespace.initializeCommerce === 'function') {
        window.Squarespace.initializeCommerce(window.Y);
      }
    } catch (error) {
      console.warn(`[${this.pluginName}] Could not re-initialize commerce bindings`, error);
    }
    try {
      if (window.wm$ && typeof window.wm$.initializeAllPlugins === 'function') {
        window.wm$.initializeAllPlugins();
      }
    } catch (error) {
      console.warn(`[${this.pluginName}] Could not re-initialize Will-Myers plugins`, error);
    }
    window.dispatchEvent(new Event('resize'));
  }

  /* ================================
     HELPERS
     ================================ */

  normalizeUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.origin);
      const path = decodeURIComponent(parsed.pathname).replace(/\/+$/, '');
      return `${path}${parsed.search}` || '/';
    } catch (error) {
      return url;
    }
  }

  appendParams(url, params) {
    const separator = url.indexOf('?') > -1 ? '&' : '?';
    const query = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');
    return `${url}${separator}${query}`;
  }

  formatPrice(value) {
    const currency = this.priceRange && this.priceRange.currency;
    try {
      if (currency) {
        return new Intl.NumberFormat(document.documentElement.lang || undefined, {
          style: 'currency',
          currency,
          minimumFractionDigits: value % 1 === 0 ? 0 : 2,
          maximumFractionDigits: 2
        }).format(value);
      }
    } catch (error) {
      /* Fall through to the plain number below. */
    }
    return String(Math.round(value * 100) / 100);
  }

  stripHtml(value) {
    if (!value) return '';
    return String(value)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  escape(value) {
    return String(value === undefined || value === null ? '' : value).replace(
      /[&<>"']/g,
      character =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character])
    );
  }

  debounce(callback, wait) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.apply(this, args), wait);
    };
  }

  destroy() {
    this.removeGlobalListeners();
    if (this.editorObserver) this.editorObserver.disconnect();
    if (this.hasLoaded) this.restoreNativeList(this.entries.map(entry => entry.node));
    this.teardownShell();
    WMStoreFilter.emitEvent(':destroy', {instance: this});
  }
}

/* ================================
   INITIALIZATION
   ================================ */
(function () {
  if (window.__wmStoreFilterInit) return;
  window.__wmStoreFilterInit = true;

  function start() {
    /* The Squarespace editor re-renders the collection out from under us,
       so leave the native list alone while someone is editing the page. */
    if (document.body.classList.contains('sqs-edit-mode-active')) return;
    if (window.__wmStoreFilter) return;
    const settings = window.wmStoreFilterSettings || {};
    window.__wmStoreFilter = new WMStoreFilter(settings);
  }

  /* Ask for the collection JSON straight away — the request then overlaps
     the rest of the page's parsing instead of queueing behind it. */
  function warmUp() {
    if (document.body && document.body.classList.contains('sqs-edit-mode-active')) return;
    const collection = ((window.Static || {}).SQUARESPACE_CONTEXT || {}).collection || {};
    if (collection.typeName === 'products' && collection.fullUrl) {
      WMStoreFilter.prefetch(collection.fullUrl);
    }
  }

  warmUp();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
