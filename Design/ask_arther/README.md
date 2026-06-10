# Ask Arther — SVG Character Assets

Structured SVG files traced from the Figma originals, with named layer groups for CSS/JS animation targeting.

## Directory Structure

```
svg/
├── arther-body-standard.svg    # Default body (9 of 13 states)
├── arther-body-sleeping.svg    # Sleeping variant (half-closed eyes)
├── arther-body-coffee.svg      # Coffee variant (wide surprised eyes)
├── icons/
│   ├── icon-chat-dots.svg      # Listening/Ready
│   ├── icon-magnifying-glass.svg # Searching
│   ├── icon-checkmark.svg      # Success
│   ├── icon-zzz.svg            # Sleeping/Idle
│   ├── icon-banner.svg         # Celebration
│   ├── icon-coffee.svg         # Break/Loading
│   ├── icon-sparkle.svg        # Thinking/Processing
│   ├── icon-sun.svg            # Happy/Welcome
│   ├── icon-crown.svg          # Achievement
│   ├── icon-heart.svg          # Love/Appreciation
│   └── icon-music-notes.svg    # Music/Fun
└── README.md
```

## State → Asset Mapping

| State | Body Variant | Status Icon | Trigger |
|-------|-------------|-------------|---------|
| Idle (default) | standard | none | No active task |
| Listening | standard | chat-dots | Chat panel open, awaiting input |
| Searching | standard | magnifying-glass | Querying app data |
| Thinking | standard | sparkle | Processing/generating response |
| Success | standard | checkmark | Action completed successfully |
| Celebration | standard | banner | Major milestone achieved |
| Happy | standard | sun | Greeting / welcome |
| Achievement | standard | crown | User accomplishment |
| Love | standard | heart | Positive feedback received |
| Music | standard | music-notes | Fun / ambient idle variation |
| Sleeping | sleeping | zzz | Extended idle (>5min) |
| Coffee Break | coffee | coffee | Loading / processing heavy task |

## Animatable Layer Groups

Each body SVG contains these named groups for CSS targeting:

```css
#body          /* Main body outline + hair */
#body-outline  /* The outer shape path */
#face          /* All facial features */
#eye-right     /* Right eye */
#eye-left      /* Left eye */
#mouth         /* Mouth shape */
#details       /* Bottom detail strands */
```

Each icon SVG has a single wrapper group:

```css
#icon-{name}   /* e.g. #icon-chat-dots, #icon-sparkle */
```

## Animation Approach

All SVGs use `fill="currentColor"` so color is inherited from the parent element's CSS `color` property. This enables theme-aware rendering without modifying the SVGs.

### Compositing in the app

```html
<div class="arther-character" style="position: relative;">
  <!-- Body layer -->
  <svg class="arther-body"><!-- inline or <use> --></svg>
  
  <!-- Status icon layer (positioned above head) -->
  <svg class="arther-icon" style="position: absolute; top: -40px;">
    <!-- inline or <use> -->
  </svg>
</div>
```

### CSS animation targets

```css
/* Idle breathing */
.arther-body #body {
  animation: breathe 3s ease-in-out infinite;
}

/* Blink cycle */
.arther-body #eye-right,
.arther-body #eye-left {
  animation: blink 4s ease-in-out infinite;
}

/* Status icon bob */
.arther-icon {
  animation: float 2s ease-in-out infinite;
}

/* State transition */
.arther-icon {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
```

## Body Variant Differences

- **Standard**: Normal open eyes (oval shapes), curved smile mouth
- **Sleeping**: Half-closed horizontal line eyes, small round mouth — used with ZZZ icon
- **Coffee**: Wide-open surprised eyes (larger, reversed orientation), small round mouth — used with coffee icon

The body outline and hair paths are identical across all three variants. Only the face group differs.

## Original Figma Source

File: `29cQOFZdWtPsut1gG7rHZL`  
Page: "Foundations / Ask Arther" (ID: `126:50`)  
Canvas size per character: 132×134px (body) + icon above
