# Store Filter Plugin

<link rel="stylesheet" href="https://your-cdn.com/installation-guide-styles.css">

Store Filter adds a search box, category and tag filters, a price range slider and its own pagination to a Squarespace store page. It loads every product in the store when the page opens, so a visitor filtering by "Ceramics" sees every ceramic piece you sell — not just the ones that happened to land on page one. The products themselves are still Squarespace's own product cards, so whatever layout, columns, spacing and aspect ratio you have set in the section keep applying. Filters sit in a sidebar beside your products by default and collapse into a slide-out drawer behind a Filter button on mobile — or stay as a row of dropdowns there, if you prefer — and every color inherits the section's theme so it looks at home in a light or a dark section.

<br>
<br>

<p class="sqsrte-large" id="installation" style="color:white;font-weight: bold">Installation</p>

Add these two code snippets to the store page you want to filter. Open **Pages → your Shop page → ⚙ Settings → Advanced → Page Header Code Injection** and paste both of them into that one box, styles first.

Paste this, the Styles, first:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/willmyerscode/store-filter@1/storeFilter.min.css">
```

And paste this, your Javascript, underneath it:

```html
<script src="https://cdn.jsdelivr.net/gh/willmyerscode/store-filter@1/storeFilter.min.js"></script>
```

That is everything — save the page and the filters appear next to your products. If you have more than one store and want the filters on all of them, put the styles in the **Site Header Code Injection** and the script in the **Site Footer Code Injection** instead; the plugin only starts itself up on store pages and quietly does nothing everywhere else.

<br>
<br>

<p class="sqsrte-large" id="usage" style="color:white;font-weight: bold">Usage</p>

1. Install the two snippets above on a **Shop** page
2. Set your section's layout, columns and spacing as normal in **Edit → Section Settings** — the filtered items keep using them
3. Save and preview the page

A few things worth knowing:

- **Filters are built from your content.** Every category and every tag used by the store becomes an option automatically, with a count beside it. Take the categories or tags off a product and the option disappears on its own.
- **The price slider appears automatically** when the store has products at more than one price, custom `filters` included. List a `"price"` group yourself to choose where it sits, or set `priceFilter: false` to drop it.
- **Options are tick boxes by default**, and can be drawn as buttons instead — set `optionStyle: "buttons"` for every group, or `style: "buttons"` on one custom group.
- **Squarespace's own filter interface is switched off** while the plugin is running — its filters, category nav, result count and pagination — so visitors never see two sets of controls. It comes back untouched in the editor.
- **Pagination is handled by the plugin**, across the whole filtered set. Squarespace's own page numbers are hidden.
- **Nothing runs while you are editing.** The Squarespace editor re-renders the collection as you work, so the plugin stays out of the way in edit mode. Preview or view the live page to see it.

<br>
<br>

<p class="sqsrte-large" id="customization" style="color:white;font-weight: bold">Customization</p>

The filters are namespaced under `.wm-store-filter`. By default the colors inherit the section's Squarespace theme, so they follow whichever theme the collection section uses. Override any of these custom properties in **Design → Custom CSS**.

<details class="wm-doc-toggle">
<summary>Colors</summary>

```css
.wm-store-filter {
  --wm-store-filter-text: var(--navigationLinkColor);
  --wm-store-filter-heading: var(--wm-store-filter-text);
  --wm-store-filter-muted: hsla(var(--accent-hsl), 0.6);
  --wm-store-filter-background: var(--siteBackgroundColor);
  --wm-store-filter-border: hsla(var(--accent-hsl), 0.2);
  --wm-store-filter-hover: hsla(var(--accent-hsl), 0.07);
  --wm-store-filter-accent: var(--primaryButtonBackgroundColor);
  --wm-store-filter-accent-contrast: var(--primaryButtonTextColor);
  --wm-store-filter-backdrop: hsla(var(--black-hsl), 0.45);
}
```

</details>

<details class="wm-doc-toggle">
<summary>Layout</summary>

```css
.wm-store-filter {
  --wm-store-filter-sidebar-width: 250px;
  --wm-store-filter-edge-offset: 0px; /* measured in JS — see below */
  --wm-store-filter-gap: 4vw;
  --wm-store-filter-group-gap: 1.75em;
  --wm-store-filter-sticky-gap: 0px;
  --wm-store-filter-sticky-offset: calc(
    var(--wm-store-filter-header-offset, 0px) +
      var(--wm-store-filter-sticky-gap, 0px)
  );
  --wm-store-filter-drawer-width: min(86vw, 340px);
  --wm-store-filter-z: 99999;
}
```

The side panel lines itself up with your logo: a section's content is usually inset further than the header is, so the plugin measures that gap and publishes it as `--wm-store-filter-edge-offset`. Set the variable yourself — `0px` leaves the panel on the section's own edge.

</details>

<details class="wm-doc-toggle">
<summary>Top layout alignment</summary>

Use the `topAlignment` setting rather than CSS — `"spread"` (the default), `"left"`, `"right"` or `"center"`. The plugin puts the value on the wrapper as `data-align`, so you can still target a particular arrangement in **Design → Custom CSS** if you need to:

```css
.wm-store-filter[data-variant='dropdown'][data-align='spread'] {
  /* your own tweaks */
}
```

The search box is `flex: 0 1 260px`; override `flex` on `.wm-store-filter-search` to make it wider or narrower.

</details>

<details class="wm-doc-toggle">
<summary>Shape &amp; type</summary>

```css
.wm-store-filter {
  --wm-store-filter-font-size: 0.85rem;
  --wm-store-filter-title-font-size: 0.9rem;
  --wm-store-filter-radius: 6px;
  --wm-store-filter-control-radius: 4px;
  --wm-store-filter-pill-radius: 100px;
  --wm-store-filter-transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --wm-store-filter-item-duration: 0.4s;
  --wm-store-filter-item-stagger: 30ms;
  --wm-store-filter-item-shift: 10px;
}
```

Filtered products fade and rise into place one after another. `--wm-store-filter-item-duration` is how long each takes, `--wm-store-filter-item-stagger` the gap between them, and `--wm-store-filter-item-shift` how far each rises — set it to `0px` for a plain fade. Anyone browsing with reduced motion turned on gets no animation at all.

`--wm-store-filter-font-size` sets the size of every word in the filters — option labels, counts, the search field, the result count and the buttons. `--wm-store-filter-title-font-size` covers the group headings and the drawer title on its own. To match your site's body copy, set the first one to `1rem` or whatever your paragraph size is.

</details>

<details class="wm-doc-toggle">
<summary>Mobile overrides</summary>

```css
.wm-store-filter {
  --wm-store-filter-gap-mobile: 20px;
}
```

</details>

<br>
<br>

<p class="sqsrte-large" id="settings" style="color:white;font-weight: bold">Settings</p>

All settings are optional. Place this snippet in the same **Page Header Code Injection** box, *before* the plugin script:

```html
<script>
  window.wmStoreFilterSettings = {
    position: "side", // "side" (default) or "top"
    search: true, // true (default) or false
    matchMode: "any", // "any" (default) or "all"
    pagination: {
      itemsPerPage: 12,
      type: "numbers", // "numbers" (default), "loadMore" or "none"
    },
  };
</script>
```

<br>

<div class="wm-doc-table">
<table>
<thead>
<tr>
<th>Setting</th>
<th>Type</th>
<th>Default</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>enabled</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Set to <code>false</code> to switch the filters off without removing the code.</td>
</tr>
<tr>
<td><code>position</code></td>
<td><code>string</code></td>
<td><code>"side"</code></td>
<td><code>"side"</code> puts the filters in a sticky sidebar beside the products. <code>"top"</code> puts them in a row of dropdown pills above them. On small screens both follow <code>mobileLayout</code>.</td>
</tr>
<tr>
<td><code>search</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Shows the search box. Search looks at each item's title, excerpt, categories and tags.</td>
</tr>
<tr>
<td><code>searchPosition</code></td>
<td><code>string</code></td>
<td><code>"beginning"</code></td>
<td>Where the search box sits. <code>"beginning"</code> puts it above the filter groups, <code>"end"</code> below them.</td>
</tr>
<tr>
<td><code>searchPlaceholder</code></td>
<td><code>string</code></td>
<td><code>"Search"</code></td>
<td>Placeholder text inside the search box.</td>
</tr>
<tr>
<td><code>searchIncludesBody</code></td>
<td><code>boolean</code></td>
<td><code>false</code></td>
<td>Also searches the full body content of each item. More thorough, slightly slower on large collections.</td>
</tr>
<tr>
<td><code>filters</code></td>
<td><code>string</code> or <code>array</code></td>
<td><code>"auto"</code></td>
<td><code>"auto"</code> builds a Category group, a Tags group and a Price group from your content. Pass an array instead to define your own groups — see <strong>Custom filter groups</strong> below.</td>
</tr>
<tr>
<td><code>showCategories</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Shows the automatic Category group. Ignored when <code>filters</code> is an array.</td>
</tr>
<tr>
<td><code>showTags</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Shows the automatic Tags group. Ignored when <code>filters</code> is an array.</td>
</tr>
<tr>
<td><code>categoriesLabel</code></td>
<td><code>string</code></td>
<td><code>"Category"</code></td>
<td>Heading above the automatic category options.</td>
</tr>
<tr>
<td><code>tagsLabel</code></td>
<td><code>string</code></td>
<td><code>"Tag"</code></td>
<td>Heading above the automatic tag options.</td>
</tr>
<tr>
<td><code>multiSelect</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Whether a visitor can tick more than one option in a group. <code>false</code> turns the group into a single-choice list with an "All" option.</td>
</tr>
<tr>
<td><code>matchMode</code></td>
<td><code>string</code></td>
<td><code>"any"</code></td>
<td>What happens when several options in one group are ticked. <code>"any"</code> shows items matching at least one of them. <code>"all"</code> shows only items matching every one of them.</td>
</tr>
<tr>
<td><code>mobileLayout</code></td>
<td><code>string</code></td>
<td><code>"drawer"</code></td>
<td>What small screens get. <code>"drawer"</code> is the filter icon and slide-out panel. <code>"top"</code> keeps the row of dropdowns instead, with no drawer.</td>
</tr>
<tr>
<td><code>topAlignment</code></td>
<td><code>string</code></td>
<td><code>"spread"</code></td>
<td>Top layout only — how the row sits across the bar. <code>"spread"</code> pushes the search box to one end and the filter pills to the other, following <code>searchPosition</code> for which side it takes. <code>"left"</code>, <code>"right"</code> or <code>"center"</code> keep the row together and move it as one.</td>
</tr>
<tr>
<td><code>optionStyle</code></td>
<td><code>string</code></td>
<td><code>"list"</code></td>
<td>How the options are drawn. <code>"list"</code> is a column of tick boxes. <code>"buttons"</code> lays them out as pills that wrap across the panel. One group can override this with its own <code>style</code>.</td>
</tr>
<tr>
<td><code>collapsible</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Lets a visitor collapse a filter group by clicking its heading.</td>
</tr>
<tr>
<td><code>startCollapsed</code></td>
<td><code>boolean</code></td>
<td><code>false</code></td>
<td>Starts every group collapsed.</td>
</tr>
<tr>
<td><code>priceFilter</code></td>
<td><code>boolean</code> or <code>string</code></td>
<td><code>"auto"</code></td>
<td><code>"auto"</code> adds the price slider when the store has products at more than one price, including when you list your own <code>filters</code> — put a <code>"price"</code> group in that list to choose where it sits. <code>false</code> removes it.</td>
</tr>
<tr>
<td><code>priceLabel</code></td>
<td><code>string</code></td>
<td><code>"Price"</code></td>
<td>Heading above the price slider.</td>
</tr>
<tr>
<td><code>pagination.enabled</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Set to <code>false</code> to show every matching item on one page.</td>
</tr>
<tr>
<td><code>pagination.itemsPerPage</code></td>
<td><code>number</code> or <code>string</code></td>
<td><code>"auto"</code></td>
<td>How many items each page shows. <code>"auto"</code> matches however many the section itself was set to display.</td>
</tr>
<tr>
<td><code>pagination.type</code></td>
<td><code>string</code></td>
<td><code>"numbers"</code></td>
<td><code>"numbers"</code> for numbered pages, <code>"loadMore"</code> for a Load More button, <code>"none"</code> for one long list.</td>
</tr>
<tr>
<td><code>pagination.loadMoreText</code></td>
<td><code>string</code></td>
<td><code>"Load More"</code></td>
<td>Label on the Load More button.</td>
</tr>
<tr>
<td><code>pagination.scrollToTop</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Scrolls back up to the first item when a page number is clicked.</td>
</tr>
<tr>
<td><code>showResultCount</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Shows the "12 Results" line above the items.</td>
</tr>
<tr>
<td><code>showOptionCounts</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Shows how many items match each option, next to that option.</td>
</tr>
<tr>
<td><code>resultCountText</code></td>
<td><code>string</code></td>
<td><code>"{count} Results"</code></td>
<td>Wording of the result count. <code>{count}</code> is replaced with the number.</td>
</tr>
<tr>
<td><code>resultCountSingularText</code></td>
<td><code>string</code></td>
<td><code>"{count} Result"</code></td>
<td>Wording used when exactly one item matches.</td>
</tr>
<tr>
<td><code>filtersTitle</code></td>
<td><code>string</code></td>
<td><code>"Filters"</code></td>
<td>Heading at the top of the mobile drawer.</td>
</tr>
<tr>
<td><code>filterButtonText</code></td>
<td><code>string</code></td>
<td><code>"Filter"</code></td>
<td>Label on the mobile button that opens the drawer.</td>
</tr>
<tr>
<td><code>applyText</code></td>
<td><code>string</code></td>
<td><code>"Show {count} Results"</code></td>
<td>Label on the button that closes the mobile drawer.</td>
</tr>
<tr>
<td><code>clearText</code></td>
<td><code>string</code></td>
<td><code>"Clear All"</code></td>
<td>Label on the link that resets every filter.</td>
</tr>
<tr>
<td><code>noResultsTitle</code></td>
<td><code>string</code></td>
<td><code>"No results found"</code></td>
<td>Heading shown when nothing matches.</td>
</tr>
<tr>
<td><code>noResultsText</code></td>
<td><code>string</code></td>
<td><code>"No results match your search. Try removing a few filters."</code></td>
<td>Text under that heading.</td>
</tr>
<tr>
<td><code>mobileBreakpoint</code></td>
<td><code>number</code></td>
<td><code>767</code></td>
<td>Screen width, in pixels, at or below which the filters become the slide-out drawer.</td>
</tr>
<tr>
<td><code>listSelector</code></td>
<td><code>string</code></td>
<td><code>null</code></td>
<td>CSS selector for the element holding the items, for layouts the plugin does not recognise.</td>
</tr>
<tr>
<td><code>itemSelector</code></td>
<td><code>string</code></td>
<td><code>null</code></td>
<td>CSS selector for a single item inside that element.</td>
</tr>
</tbody>
</table>
</div>

<br>

**Custom filter groups**

Set `filters` to an array to build the groups yourself. Each group says whether it filters on categories or tags and which values belong in it, and you can have as many groups as you like:

```html
<script>
  window.wmStoreFilterSettings = {
    filters: [
      {
        label: "Type",
        type: "tag",
        options: ["One", "Two", "Three", "Four"],
        multiSelect: true,
        match: "any",
      },
      {
        label: "Collection",
        type: "category",
        options: ["Spring", "Summer"],
        multiSelect: false,
      },
      {
        label: "Price",
        type: "price",
      },
    ],
  };
</script>
```

<br>

<div class="wm-doc-table">
<table>
<thead>
<tr>
<th>Key</th>
<th>Type</th>
<th>Default</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>label</code></td>
<td><code>string</code></td>
<td>—</td>
<td>The heading shown above the group.</td>
</tr>
<tr>
<td><code>type</code></td>
<td><code>string</code></td>
<td><code>"category"</code></td>
<td><code>"category"</code>, <code>"tag"</code> or <code>"price"</code>.</td>
</tr>
<tr>
<td><code>options</code></td>
<td><code>array</code></td>
<td>all of them</td>
<td>Which categories or tags appear in this group, in the order you list them. Leave it out to include every one used in the collection. Names that no item uses are skipped.</td>
</tr>
<tr>
<td><code>multiSelect</code></td>
<td><code>boolean</code></td>
<td><code>true</code></td>
<td>Whether more than one option in this group can be ticked at a time.</td>
</tr>
<tr>
<td><code>match</code></td>
<td><code>string</code></td>
<td><code>"any"</code></td>
<td>Used when multiple options are ticked. <code>"any"</code> matches items with at least one of them, <code>"all"</code> matches only items with every one of them.</td>
</tr>
<tr>
<td><code>style</code></td>
<td><code>string</code></td>
<td>the <code>optionStyle</code> setting</td>
<td><code>"list"</code> for tick boxes or <code>"buttons"</code> for pills, for this group only.</td>
</tr>
<tr>
<td><code>startCollapsed</code></td>
<td><code>boolean</code></td>
<td><code>false</code></td>
<td>Starts this group collapsed.</td>
</tr>
</tbody>
</table>
</div>

<br>
<br>

<p class="sqsrte-large" id="faqs" style="color:white;font-weight: bold">FAQs</p>

<details class="wm-doc-toggle">
<summary>Does this work on a Blog page?</summary>

No — Store Filter is for stores only. On any other page it starts up, finds no product grid, and stops without touching anything. It works with both the current and the classic Squarespace product list layouts; if your shop uses something unusual and the filters do not appear, set `listSelector` and `itemSelector` to point at your product grid.

</details>

<details class="wm-doc-toggle">
<summary>Will this slow my page down?</summary>

The page itself loads exactly as it did before — Squarespace still renders the first page of products normally. The plugin asks for the rest of the catalogue in the background, starting that request while the page is still loading so it overlaps rather than queues. Every page is loaded however large the store is, so a big catalogue means a few more background requests before the filters are ready; the products on screen are usable throughout.

</details>

<details class="wm-doc-toggle">
<summary>Do the Add to Cart buttons still work on filtered products?</summary>

Yes for the products Squarespace rendered on the page itself, and the plugin re-runs Squarespace's commerce setup for the ones it brings in from later pages. If you have a very large shop and want to be certain, set `pagination.itemsPerPage` to match the number of products your section already shows, or send visitors to the product page to add to cart.

</details>

<details class="wm-doc-toggle">
<summary>Can I self host this code?</summary>

**Step 1** — Download the `.js` and `.css` files and upload them to your Squarespace website:

- [`storeFilter.min.css`](https://cdn.jsdelivr.net/gh/willmyerscode/store-filter@1/storeFilter.min.css)
- [`storeFilter.min.js`](https://cdn.jsdelivr.net/gh/willmyerscode/store-filter@1/storeFilter.min.js)

**Step 2** — Copy the two code snippets and paste them into their designated areas.

The Styles go in the Site Header Code Injection area:

```html
<!-- Store Filter Styles from Will-Myers.com -->
<link rel="stylesheet" href="/s/wmStoreFilter.css">
```

The Javascript goes in the Site Footer Code Injection area:

```html
<!-- Store Filter from Will-Myers.com -->
<script src="/s/wmStoreFilter.js"></script>
```

**Step 3** — Replace the URLs `/s/wmStoreFilter.css` and `/s/wmStoreFilter.js` to match the unique URLs that Squarespace generates for you.

</details>

<details class="wm-doc-toggle">
<summary>Can I hire you to make further customizations to this plugin?</summary>

Unfortunately at will-myers.com we don't take on custom work like this. However, we can recommend a handful of Trusted Partners who all have extensive experience working with our code:

- Abi (part of the Will Myers development team) — [abibacon.com](https://abibacon.com)
- Kwame — [kwameand.co](https://kwameand.co)
- Tuan — [beaverhero.com](https://beaverhero.com)

</details>

<details class="wm-doc-toggle">
<summary>Can I have a receipt for this plugin?</summary>

Of course! Squarespace doesn't send these out automatically, but you can log in with the email you used for your purchase to download your receipt at [toolkit.will-myers.com/account/billing](https://toolkit.will-myers.com/account/billing).

</details>
