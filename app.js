/* ----------------------------------------------------
   PulseFeed — Javascript Application Controller
   ---------------------------------------------------- */

// Default feed configuration
const DEFAULT_CATEGORIES = [
  {
    id: 'ai',
    name: 'AI-related news',
    feeds: [
      'https://techcrunch.com/category/artificial-intelligence/feed/',
      'https://www.wired.com/feed/tag/ai/latest/rss'
    ]
  },
  {
    id: 'android',
    name: 'Android-related news',
    feeds: [
      'https://www.androidpolice.com/feed/',
      'https://www.androidcentral.com/feed'
    ]
  },
  {
    id: 'us',
    name: 'US-related news',
    feeds: [
      'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
      'https://feeds.npr.org/1003/rss.xml'
    ]
  },
  {
    id: 'apple',
    name: 'Apple-related news',
    feeds: [
      'https://macrumors.com/macrumors.xml',
      'https://9to5mac.com/feed/'
    ]
  },
  {
    id: 'google',
    name: 'Google-related news',
    feeds: [
      'https://9to5google.com/feed/',
      'https://news.google.com/rss/search?q=Google'
    ]
  },
  {
    id: 'samsung',
    name: 'Samsung-related news',
    feeds: [
      'https://www.sammobile.com/feed/',
      'https://news.google.com/rss/search?q=Samsung'
    ]
  }
];

// ----------------------------------------------------
// Global App State
// ----------------------------------------------------
const state = {
  categories: [],
  articlesCache: {}, // Maps categoryId to parsed articles list
  activeCategory: 'all', // 'all' or categoryId
  theme: 'dark',
  carouselIndex: 0,
  carouselTimer: null,
  isFetching: false
};

// CORS Proxy prefix (dynamic detection: uses local proxy if served locally, else fallback to public)
const isLocalServer = window.location.protocol !== 'file:' && 
                      (window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' || 
                       window.location.hostname === '::1' ||
                       window.location.hostname === '[::1]');
const CORS_PROXY = isLocalServer ? '/proxy?url=' : 'https://corsproxy.io/?';

// Stop words list for trending news analysis
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'but', 'or', 'for', 'with', 'on', 'in', 'at', 'to', 'by', 'of', 'is', 'are', 'was', 'were', 
  'has', 'have', 'had', 'it', 'its', 'they', 'them', 'this', 'that', 'these', 'those', 'from', 'as', 'be', 'will', 
  'with', 'about', 'how', 'what', 'why', 'who', 'where', 'when', 'more', 'new', 'top', 'latest', 'up', 'down', 'out', 
  'over', 'under', 'into', 'some', 'any', 'each', 'all', 'every', 'both', 'their', 'our', 'your', 'his', 'her', 'itself',
  'can', 'could', 'should', 'would', 'may', 'might', 'must', 'just', 'only', 'than', 'then', 'also', 'even', 'after', 
  'before', 'first', 'second', 'years', 'day', 'week', 'month', 'news', 'update', 'feed'
]);

// ----------------------------------------------------
// App Initialization
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initCategories();
  setupEventListeners();
  refreshAllFeeds();
});

// ----------------------------------------------------
// Theme Manager
// ----------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem('pulsefeed_theme') || 'dark';
  setTheme(savedTheme);
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pulsefeed_theme', theme);
}

function toggleTheme() {
  const newTheme = state.theme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

// ----------------------------------------------------
// Category Management
// ----------------------------------------------------
function initCategories() {
  const savedCategories = localStorage.getItem('pulsefeed_categories');
  if (savedCategories) {
    try {
      state.categories = JSON.parse(savedCategories);
    } catch (e) {
      console.error('Failed to parse cached categories', e);
      state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    }
  } else {
    // Initial Load: Deep clone default configs
    state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    saveCategories();
  }
}

function saveCategories() {
  localStorage.setItem('pulsefeed_categories', JSON.stringify(state.categories));
}

// Sanitizes a category name to be a valid element ID
function generateCategoryId(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

// ----------------------------------------------------
// UI Renderers - Static Elements
// ----------------------------------------------------

// Renders the horizontal scrolling tabs at the top of the dashboard
function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  if (!container) return;

  let html = `<button class="tab-btn ${state.activeCategory === 'all' ? 'active' : ''}" data-category="all">All</button>`;
  
  state.categories.forEach(cat => {
    // Check if category has any articles loaded to show clean feedback
    const activeClass = state.activeCategory === cat.id ? 'active' : '';
    html += `<button class="tab-btn ${activeClass}" data-category="${cat.id}">${cat.name.replace('-related news', '').replace('news', '').trim()}</button>`;
  });

  container.innerHTML = html;

  // Add click listeners to tabs
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const categoryId = e.currentTarget.getAttribute('data-category');
      switchCategoryTab(categoryId);
    });
  });
}

// Renders the category chips inside the Tag Input settings field
function renderSettingsChips() {
  const container = document.getElementById('tag-input-container');
  const input = document.getElementById('category-input');
  if (!container || !input) return;

  // Remove existing chips
  container.querySelectorAll('.tag-chip').forEach(el => el.remove());

  // Render fresh chips before the input element
  state.categories.forEach(cat => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `
      <span>${cat.name}</span>
      <button class="tag-chip-close" data-id="${cat.id}" aria-label="Remove category">&times;</button>
    `;
    
    chip.querySelector('.tag-chip-close').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.currentTarget.getAttribute('data-id');
      removeCategory(id);
    });

    container.insertBefore(chip, input);
  });
}

// Renders the list of categories and their respective RSS feed URLs in Settings
function renderFeedsManager() {
  const container = document.getElementById('feeds-manager');
  if (!container) return;

  if (state.categories.length === 0) {
    container.innerHTML = `
      <div class="no-feeds-alert" style="justify-content: center; padding: 2rem 1rem;">
        <span>No categories active. Add one using the input above.</span>
      </div>
    `;
    return;
  }

  let html = '';
  state.categories.forEach(cat => {
    html += `
      <div class="category-feed-card" data-cat-id="${cat.id}">
        <div class="feed-card-header">
          <h4 class="feed-card-title">${cat.name}</h4>
          <span class="feed-meta">${cat.feeds.length} source(s)</span>
        </div>
        
        <div class="feed-urls-list">
          ${cat.feeds.map((feedUrl, idx) => `
            <div class="feed-url-item">
              <a href="${feedUrl}" target="_blank" rel="noopener noreferrer" class="feed-url-link" title="${feedUrl}">
                ${feedUrl}
              </a>
              <button class="del-feed-btn" data-cat-id="${cat.id}" data-feed-idx="${idx}" aria-label="Delete source">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          `).join('')}
          
          ${cat.feeds.length === 0 ? `
            <div class="no-feeds-alert">
              <span>⚠️ No feed sources configured. No news will load.</span>
              <button class="restore-feed-link" data-cat-id="${cat.id}">Restore default feed</button>
            </div>
          ` : ''}
        </div>

        <form class="add-feed-form" data-cat-id="${cat.id}">
          <input type="url" required class="feed-url-input" placeholder="Paste RSS feed URL..." aria-label="New feed URL">
          <button type="submit" class="add-feed-btn">
            <i data-lucide="plus" style="width:1rem; height:1rem; margin-right: 0.25rem;"></i> Add
          </button>
        </form>
      </div>
    `;
  });

  container.innerHTML = html;
  lucide.createIcons(); // Process lucide icons inside generated HTML

  // Add click listeners to delete feed buttons
  container.querySelectorAll('.del-feed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const catId = btn.getAttribute('data-cat-id');
      const feedIdx = parseInt(btn.getAttribute('data-feed-idx'), 10);
      deleteFeedFromCategory(catId, feedIdx);
    });
  });

  // Add click listeners to restore default feed links
  container.querySelectorAll('.restore-feed-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const catId = btn.getAttribute('data-cat-id');
      restoreDefaultFeedForCategory(catId);
    });
  });

  // Add submission listeners to add feed forms
  container.querySelectorAll('.add-feed-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const catId = form.getAttribute('data-cat-id');
      const input = form.querySelector('.feed-url-input');
      const url = input.value.trim();
      addFeedToCategory(catId, url);
    });
  });
}

// ----------------------------------------------------
// Feed Fetcher & XML Parser Logic
// ----------------------------------------------------

// Fetches articles for a single feed URL, parses and returns normalized array
async function fetchAndParseFeed(feedUrl, categoryId) {
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(feedUrl)}`;
  
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // Check parser errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) throw new Error('XML parsing failed.');

    const articles = [];
    
    // Check if RSS 2.0 (item) or Atom (entry)
    const items = xmlDoc.querySelectorAll('item');
    if (items.length > 0) {
      // RSS 2.0 Parsing
      items.forEach(item => {
        try {
          const title = item.querySelector('title')?.textContent?.trim() || 'Untitled Article';
          const link = item.querySelector('link')?.textContent?.trim() || '';
          
          // Description cleanup
          let description = item.querySelector('description')?.textContent?.trim() || '';
          description = stripHtml(description);
          
          // Date parsing
          const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
          const date = parseDate(pubDate);

          // Creator
          const creator = item.querySelector('creator, dc\\:creator')?.textContent?.trim() || '';

          // Image Parsing (Highly Robust)
          const imageUrl = extractImageUrl(item);

          // Extract Source Name from RSS or url hostname
          const source = xmlDoc.querySelector('channel > title')?.textContent?.trim() || getHostname(link);

          if (link) {
            articles.push({
              id: generateArticleId(link),
              title,
              link,
              description,
              date,
              creator,
              imageUrl,
              source,
              categoryId
            });
          }
        } catch (cardErr) {
          console.warn('Failed to parse individual RSS item', cardErr);
        }
      });
    } else {
      // Atom Parsing
      const entries = xmlDoc.querySelectorAll('entry');
      entries.forEach(entry => {
        try {
          const title = entry.querySelector('title')?.textContent?.trim() || 'Untitled Article';
          
          let link = '';
          const linkEl = entry.querySelector('link[rel="alternate"]') || entry.querySelector('link');
          if (linkEl) {
            link = linkEl.getAttribute('href')?.trim() || linkEl.textContent?.trim() || '';
          }

          let description = entry.querySelector('summary')?.textContent?.trim() || 
                              entry.querySelector('content')?.textContent?.trim() || '';
          description = stripHtml(description);

          const updatedDate = entry.querySelector('updated')?.textContent?.trim() || 
                              entry.querySelector('published')?.textContent?.trim() || '';
          const date = parseDate(updatedDate);

          const creator = entry.querySelector('author name')?.textContent?.trim() || '';

          // Image Parsing
          const imageUrl = extractImageUrl(entry);

          const source = xmlDoc.querySelector('title')?.textContent?.trim() || getHostname(link);

          if (link) {
            articles.push({
              id: generateArticleId(link),
              title,
              link,
              description,
              date,
              creator,
              imageUrl,
              source,
              categoryId
            });
          }
        } catch (atomErr) {
          console.warn('Failed to parse individual Atom entry', atomErr);
        }
      });
    }

    return articles;
  } catch (err) {
    console.error(`Error loading feed: ${feedUrl}`, err);
    showToast(`Error fetching: ${getHostname(feedUrl)}`, 'error');
    return [];
  }
}

// Sanitization helpers
function stripHtml(html) {
  if (!html) return '';
  const text = html.replace(/<\/?[^>]+(>|$)/g, ''); // Basic tag removal
  // Decode basic HTML entities
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? new Date() : date;
}

function getHostname(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace('www.', '');
  } catch (e) {
    return 'News Source';
  }
}

function generateArticleId(link) {
  return btoa(link).substring(0, 16);
}

// Robust image scraper for RSS/Atom XML nodes
function extractImageUrl(node) {
  // 1. Try standard enclosure tag
  const enclosure = node.querySelector('enclosure');
  if (enclosure && enclosure.getAttribute('type')?.startsWith('image/')) {
    const url = enclosure.getAttribute('url');
    if (url) return url;
  }

  // 2. Try namespace local names for media:content and media:thumbnail
  const allChildren = Array.from(node.querySelectorAll('*'));
  
  const mediaContent = allChildren.find(el => el.localName === 'content');
  if (mediaContent && mediaContent.getAttribute('url') && mediaContent.getAttribute('medium') !== 'video') {
    return mediaContent.getAttribute('url');
  }

  const mediaThumbnail = allChildren.find(el => el.localName === 'thumbnail');
  if (mediaThumbnail && mediaThumbnail.getAttribute('url')) {
    return mediaThumbnail.getAttribute('url');
  }

  // 3. Scan HTML tags in description or content:encoded using Regex
  const contentEncoded = allChildren.find(el => el.localName === 'encoded')?.textContent || '';
  const descText = node.querySelector('description')?.textContent || '';
  const combinedText = `${contentEncoded} ${descText}`;

  if (combinedText) {
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/i;
    const match = combinedText.match(imgRegex);
    if (match && match[1]) {
      const src = match[1];
      // Skip tiny trackers or loading gifs
      if (!src.includes('feeds.feedburner.com') && 
          !src.includes('doubleclick') && 
          !src.includes('feedpress') && 
          !src.endsWith('.gif') &&
          src.startsWith('http')) {
        return src;
      }
    }
  }

  return null;
}

// ----------------------------------------------------
// Dynamic Content Aggregator & Refresher
// ----------------------------------------------------

// Syncs feeds for all categories in parallel and loads them into memory
async function refreshAllFeeds() {
  if (state.isFetching) return;
  state.isFetching = true;
  showLoadingStates(true);

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.classList.add('spinning');

  // Map category fetch tasks
  const fetchPromises = state.categories.map(async (cat) => {
    // If no feeds, clear cache
    if (cat.feeds.length === 0) {
      state.articlesCache[cat.id] = [];
      return;
    }

    const feedPromises = cat.feeds.map(url => fetchAndParseFeed(url, cat.id));
    const results = await Promise.allSettled(feedPromises);
    
    // Combine fetched articles
    let combinedArticles = [];
    results.forEach(res => {
      if (res.status === 'fulfilled') {
        combinedArticles = combinedArticles.concat(res.value);
      }
    });

    // Remove exact duplicates by link
    const seenLinks = new Set();
    const uniqueArticles = combinedArticles.filter(art => {
      if (seenLinks.has(art.link)) return false;
      seenLinks.add(art.link);
      return true;
    });

    // Sort by latest publish date
    uniqueArticles.sort((a, b) => b.date - a.date);
    
    // Store in cache
    state.articlesCache[cat.id] = uniqueArticles;
  });

  await Promise.allSettled(fetchPromises);
  
  state.isFetching = false;
  showLoadingStates(false);
  if (refreshBtn) refreshBtn.classList.remove('spinning');

  // Trigger UI update
  renderDashboard();
  renderCategoryTabs();
  showToast('News feeds synced successfully!', 'success');
}

// Fetches/refreshes feeds only for a specific category ID (useful on additions)
async function refreshCategoryFeed(categoryId) {
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat) return;

  if (cat.feeds.length === 0) {
    state.articlesCache[cat.id] = [];
    renderDashboard();
    return;
  }

  const feedPromises = cat.feeds.map(url => fetchAndParseFeed(url, cat.id));
  const results = await Promise.allSettled(feedPromises);
  
  let combinedArticles = [];
  results.forEach(res => {
    if (res.status === 'fulfilled') {
      combinedArticles = combinedArticles.concat(res.value);
    }
  });

  const seenLinks = new Set();
  const uniqueArticles = combinedArticles.filter(art => {
    if (seenLinks.has(art.link)) return false;
    seenLinks.add(art.link);
    return true;
  });

  uniqueArticles.sort((a, b) => b.date - a.date);
  state.articlesCache[cat.id] = uniqueArticles;

  renderDashboard();
  renderCategoryTabs();
}

function showLoadingStates(isLoading) {
  const loaders = document.querySelectorAll('.carousel-loader, .feed-loader');
  loaders.forEach(el => {
    el.style.display = isLoading ? 'flex' : 'none';
  });
}

// ----------------------------------------------------
// Trending Algorithm (Client-Side Word Analysis)
// ----------------------------------------------------

// Calculates word popularity trends and selects top 5 trending articles
function calculateTrendingArticles(articles) {
  if (articles.length === 0) return [];
  if (articles.length <= 5) return [...articles];

  // 1. Gather word frequency tokens across titles
  const tokenFreq = {};
  articles.forEach(art => {
    // Sanitize title to lowercase alphanumeric words
    const words = art.title.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    
    // Count frequency
    words.forEach(w => {
      tokenFreq[w] = (tokenFreq[w] || 0) + 1;
    });
  });

  // Get max frequency to normalize keyword boosts
  const frequencies = Object.values(tokenFreq);
  const maxFreq = frequencies.length > 0 ? Math.max(...frequencies) : 1;

  // 2. Score articles
  const scoredArticles = articles.map(art => {
    // Heuristic A: Recency decay (newer articles have higher baseline)
    const hoursOld = (Date.now() - art.date.getTime()) / (1000 * 60 * 60);
    // Baseline score ranges from 1.0 (just published) down to near 0 for old news
    let score = 1 / (hoursOld + 1);

    // Heuristic B: Keyword relevance (articles with active trending words get boosted)
    const titleWords = art.title.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    let keywordGlow = 0;
    titleWords.forEach(w => {
      if (tokenFreq[w]) {
        // Boost is higher for keywords that appear frequently in current batch
        keywordGlow += tokenFreq[w] / maxFreq;
      }
    });

    score += keywordGlow * 0.4; // Weigh keyword trends significantly

    // Heuristic C: Rich media boost (featured carousel slides must look premium)
    if (art.imageUrl) {
      score += 0.3;
    }

    return { article: art, score };
  });

  // 3. Sort by score descending and return original article structures
  scoredArticles.sort((a, b) => b.score - a.score);
  return scoredArticles.slice(0, 5).map(item => item.article);
}

// ----------------------------------------------------
// UI Renderers - News Feed & Carousel
// ----------------------------------------------------

function renderDashboard() {
  // Aggregate articles based on active filter
  let activeArticles = [];
  
  if (state.activeCategory === 'all') {
    // Combine all cached articles
    Object.values(state.articlesCache).forEach(artList => {
      activeArticles = activeArticles.concat(artList);
    });
    
    // De-duplicate in case feeds overlap across tabs
    const seenLinks = new Set();
    activeArticles = activeArticles.filter(art => {
      if (seenLinks.has(art.link)) return false;
      seenLinks.add(art.link);
      return true;
    });
    
    // Sort combined by date descending
    activeArticles.sort((a, b) => b.date - a.date);
    document.getElementById('feed-title-display').textContent = 'Global Feed';
    document.getElementById('feed-meta-display').textContent = `${activeArticles.length} articles compiled`;
  } else {
    // Pull specific category list
    activeArticles = state.articlesCache[state.activeCategory] || [];
    const cat = state.categories.find(c => c.id === state.activeCategory);
    document.getElementById('feed-title-display').textContent = cat ? cat.name : 'Filtered Feed';
    document.getElementById('feed-meta-display').textContent = `${activeArticles.length} articles found`;
  }

  // Calculate trending carousel articles
  const trendingList = calculateTrendingArticles(activeArticles);

  // Render Carousel
  renderCarousel(trendingList);

  // Render Card Grid (Latest First)
  renderCardGrid(activeArticles);
}

// Renders the top news carousel
function renderCarousel(trendingArticles) {
  const container = document.getElementById('carousel-container');
  if (!container) return;

  // Clear autoplay timer
  if (state.carouselTimer) {
    clearInterval(state.carouselTimer);
    state.carouselTimer = null;
  }

  if (trendingArticles.length === 0) {
    container.innerHTML = `
      <div class="carousel-loader" style="display:flex;">
        <i data-lucide="inbox" style="width:2.5rem; height:2.5rem;"></i>
        <span>No articles available to calculate trends. Try syncing.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  state.carouselIndex = 0; // Reset index

  let slidesHtml = '<div class="carousel-slides-wrapper">';
  let indicatorsHtml = '<div class="carousel-indicators">';

  trendingArticles.forEach((art, idx) => {
    const activeClass = idx === 0 ? 'active' : '';
    const imageSection = art.imageUrl 
      ? `<img class="carousel-image-bg" src="${art.imageUrl}" alt="${art.title}" onerror="this.outerHTML='<div class=\\'carousel-gradient-bg\\'></div>'">`
      : `<div class="carousel-gradient-bg"></div>`;

    const categoryText = getCategoryDisplayName(art.categoryId);

    slidesHtml += `
      <div class="carousel-slide ${activeClass}" data-slide-index="${idx}">
        <div class="carousel-image-container">
          ${imageSection}
          <div class="carousel-slide-overlay">
            <div class="slide-meta-row">
              <span class="slide-category">${categoryText}</span>
              <span class="slide-source">${art.source}</span>
              <span class="slide-bullet">&bull;</span>
              <span class="slide-time">${formatTimeAgo(art.date)}</span>
            </div>
            <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="slide-title-link">
              <h3 class="slide-title">${art.title}</h3>
            </a>
            <p class="slide-description">${art.description ? truncateText(art.description, 160) : ''}</p>
          </div>
        </div>
      </div>
    `;

    indicatorsHtml += `
      <button class="indicator-dot ${idx === 0 ? 'active' : ''}" data-slide-to="${idx}" aria-label="Go to slide ${idx + 1}"></button>
    `;
  });

  slidesHtml += '</div>'; // close slides-wrapper
  indicatorsHtml += '</div>'; // close indicators

  // Add arrows overlay
  const controlsHtml = `
    <button class="carousel-btn carousel-btn-prev" id="carousel-prev" aria-label="Previous slide">
      <i data-lucide="chevron-left"></i>
    </button>
    <button class="carousel-btn carousel-btn-next" id="carousel-next" aria-label="Next slide">
      <i data-lucide="chevron-right"></i>
    </button>
  `;

  container.innerHTML = slidesHtml + controlsHtml + indicatorsHtml;
  lucide.createIcons();

  // Attach carousel interactivity
  setupCarouselActions(trendingArticles.length);
}

function setupCarouselActions(slideCount) {
  const container = document.getElementById('carousel-container');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const dots = container.querySelectorAll('.indicator-dot');
  
  if (slideCount <= 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    return; // Autoplay and dots not needed for single slide
  }

  // Active slide updater
  const updateActiveSlide = (newIndex) => {
    // Handle bounds
    if (newIndex >= slideCount) newIndex = 0;
    if (newIndex < 0) newIndex = slideCount - 1;
    
    state.carouselIndex = newIndex;

    // Update slides class
    container.querySelectorAll('.carousel-slide').forEach((slide, idx) => {
      if (idx === newIndex) {
        slide.classList.add('active');
      } else {
        slide.classList.remove('active');
      }
    });

    // Update dots class
    dots.forEach((dot, idx) => {
      if (idx === newIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  };

  // Autoplay Logic
  const startAutoplay = () => {
    if (state.carouselTimer) clearInterval(state.carouselTimer);
    state.carouselTimer = setInterval(() => {
      updateActiveSlide(state.carouselIndex + 1);
    }, 5000);
  };

  const stopAutoplay = () => {
    if (state.carouselTimer) clearInterval(state.carouselTimer);
  };

  // Autoplay cycle start
  startAutoplay();

  // Event Listeners
  prevBtn.addEventListener('click', () => {
    updateActiveSlide(state.carouselIndex - 1);
    startAutoplay(); // Reset interval
  });

  nextBtn.addEventListener('click', () => {
    updateActiveSlide(state.carouselIndex + 1);
    startAutoplay();
  });

  dots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      const targetIdx = parseInt(e.currentTarget.getAttribute('data-slide-to'), 10);
      updateActiveSlide(targetIdx);
      startAutoplay();
    });
  });

  // Pause on hover
  container.addEventListener('mouseenter', stopAutoplay);
  container.addEventListener('mouseleave', startAutoplay);
}

// Renders the news grid cards
function renderCardGrid(articles) {
  const container = document.getElementById('articles-grid');
  if (!container) return;

  if (articles.length === 0) {
    container.innerHTML = `
      <div class="no-articles-card">
        <i data-lucide="folder-open"></i>
        <h4>No articles found</h4>
        <p>There are no RSS articles available for this view. Try adjusting feed settings or checking network connections.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  let html = '';
  articles.forEach(art => {
    const cardBadge = getCategoryDisplayName(art.categoryId);
    const dateText = formatTimeAgo(art.date);

    const imageSection = art.imageUrl
      ? `<img class="card-image" src="${art.imageUrl}" alt="${art.title}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-image-fallback\\'><i data-lucide=\\'image\\'></i></div>'; lucide.createIcons();">`
      : `<div class="card-image-fallback"><i data-lucide="image"></i></div>`;

    html += `
      <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="news-card">
        <div class="card-img-container">
          <span class="card-badge">${cardBadge}</span>
          ${imageSection}
        </div>
        <div class="card-body">
          <div class="card-meta">
            <span class="card-source">${art.source}</span>
            <span class="card-bullet">&bull;</span>
            <span class="card-time">${dateText}</span>
          </div>
          <h3 class="card-title" title="${art.title}">${art.title}</h3>
          <p class="card-desc">${art.description ? truncateText(art.description, 140) : 'Click to view full article details from the source.'}</p>
          <div class="card-footer">
            <span class="card-author">${art.creator ? `By ${truncateText(art.creator, 20)}` : ''}</span>
            <span class="read-btn">Read Source <i data-lucide="arrow-up-right"></i></span>
          </div>
        </div>
      </a>
    `;
  });

  container.innerHTML = html;
  lucide.createIcons();
}

// ----------------------------------------------------
// Event Setup & Switching Handler Actions
// ----------------------------------------------------

function setupEventListeners() {
  // Theme Toggle
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // Refresh Button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAllFeeds);
  }

  // Settings Drawer View Toggles
  const settingsBtn = document.getElementById('settings-toggle');
  const drawer = document.getElementById('settings-drawer');
  const closeBtn = document.getElementById('settings-close');
  const backdrop = document.getElementById('drawer-backdrop');

  if (settingsBtn && drawer) {
    settingsBtn.addEventListener('click', () => {
      renderSettingsChips();
      renderFeedsManager();
      drawer.classList.add('open');
    });
  }

  const closeDrawer = () => {
    if (drawer) drawer.classList.remove('open');
  };

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  // Settings Reset Button
  const resetBtn = document.getElementById('reset-defaults-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all categories and feed sources to factory defaults? Any custom feeds you added will be lost.')) {
        state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        saveCategories();
        renderSettingsChips();
        renderFeedsManager();
        refreshAllFeeds();
        closeDrawer();
        showToast('Restored default configurations', 'success');
      }
    });
  }

  // Category Tag Input Key Press (Enter check)
  const categoryInput = document.getElementById('category-input');
  if (categoryInput) {
    categoryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = categoryInput.value.trim();
        if (value) {
          addCategory(value);
          categoryInput.value = '';
        }
      }
    });
  }

  // Clicking Logo refreshes dashboard to ALL tab
  const logoBtn = document.getElementById('logo-refresh');
  if (logoBtn) {
    logoBtn.addEventListener('click', () => {
      switchCategoryTab('all');
    });
  }
}

// Switch Active Category Dashboard Tabs
function switchCategoryTab(categoryId) {
  state.activeCategory = categoryId;
  renderCategoryTabs();
  renderDashboard();
  
  // Smooth scroll page back to top to read new feed
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----------------------------------------------------
// State Mutation Actions (Adding/Removing Categories & Feeds)
// ----------------------------------------------------

// Creates a new category from user string input
function addCategory(name) {
  const id = generateCategoryId(name);
  
  if (!id) {
    showToast('Invalid category name', 'error');
    return;
  }

  // Check duplicates
  const exists = state.categories.some(c => c.id === id);
  if (exists) {
    showToast('Category already exists!', 'info');
    return;
  }

  // Generate Google News search RSS feed link by default
  const defaultFeed = `https://news.google.com/rss/search?q=${encodeURIComponent(name)}`;

  const newCategory = {
    id,
    name: name.endsWith('news') ? name : `${name}-related news`,
    feeds: [defaultFeed]
  };

  state.categories.push(newCategory);
  saveCategories();
  
  // Refresh views
  renderSettingsChips();
  renderFeedsManager();
  renderCategoryTabs();

  // Async Fetch feeds for new category immediately
  showToast(`Added category: "${name}"`, 'success');
  refreshCategoryFeed(id);
}

// Deletes a category
function removeCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;

  state.categories = state.categories.filter(c => c.id !== id);
  saveCategories();

  // If deleted category was active, fall back to 'all'
  if (state.activeCategory === id) {
    state.activeCategory = 'all';
  }

  // Delete from cache
  delete state.articlesCache[id];

  renderSettingsChips();
  renderFeedsManager();
  renderCategoryTabs();
  renderDashboard();

  showToast(`Removed "${cat.name}"`, 'info');
}

// Adds an individual feed URL to a category
function addFeedToCategory(categoryId, url) {
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat) return;

  // URL Syntax Validation
  if (!isValidUrl(url)) {
    showToast('Invalid URL syntax!', 'error');
    return;
  }

  // Check duplicate URLs
  if (cat.feeds.includes(url)) {
    showToast('This URL source is already linked!', 'info');
    return;
  }

  cat.feeds.push(url);
  saveCategories();
  renderFeedsManager();

  showToast(`Feed added to ${cat.name.replace('-related news', '')}`, 'success');
  refreshCategoryFeed(categoryId);
}

// Deletes an individual feed URL from a category
function deleteFeedFromCategory(categoryId, feedIndex) {
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat) return;

  cat.feeds.splice(feedIndex, 1);
  saveCategories();
  renderFeedsManager();

  showToast('Source link removed', 'info');
  refreshCategoryFeed(categoryId);
}

// Restores the Google News RSS search fallback for a category with no feeds
function restoreDefaultFeedForCategory(categoryId) {
  const cat = state.categories.find(c => c.id === categoryId);
  if (!cat) return;

  const displayName = cat.name.replace('-related news', '').replace('news', '').trim();
  const defaultFeed = `https://news.google.com/rss/search?q=${encodeURIComponent(displayName)}`;

  cat.feeds = [defaultFeed];
  saveCategories();
  renderFeedsManager();
  
  showToast('Fallback Google feed restored', 'success');
  refreshCategoryFeed(categoryId);
}

// ----------------------------------------------------
// UI Notification Alerts (Toast System)
// ----------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Icon selector
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons(); // Process injected icons

  // Animate Entrance
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Auto clean up after 4.5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    // Remove node after transition completes
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 4500);
}

// ----------------------------------------------------
// Utility Helper Functions
// ----------------------------------------------------

function getCategoryDisplayName(catId) {
  const cat = state.categories.find(c => c.id === catId);
  if (!cat) return 'News';
  return cat.name.replace('-related news', '').replace('news', '').trim();
}

function truncateText(text, length) {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return `${interval}y ago`;
  
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return `${interval}mo ago`;
  
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return `${interval}d ago`;
  
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return `${interval}h ago`;
  
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return `${interval}m ago`;
  
  if (seconds < 10) return 'Just now';
  return `${Math.floor(seconds)}s ago`;
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;  
  }
}
