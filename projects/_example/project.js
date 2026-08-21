/* Project manifest. One file per client — this is the only thing that
   changes between clients, together with the images/ folder next to it.
   `image` is optional; while absent a grey placeholder renders at w × h. */
window.DRAPER_PROJECT = {
  id: "example",
  folder: "_example",
  client: "Example Client",
  round: "Round 1",
  intro: "Click any frame to see the thinking behind it and leave feedback. You can also respond to a whole group at once from the group header.",
  lanes: [
    {
      id: "web", name: "Web",
      groups: [
        {
          id: "preloader", name: "Preloader",
          idea: "What the visitor sees in the first second. We are testing how much personality belongs before the site proper.",
          items: [
            { id: "web-preloader-1", title: "Preloader 1", w: 1440, h: 889, idea: "Wordmark holds centre while the percentage counts up. Quiet, no motion beyond the number." },
            { id: "web-preloader-2", title: "Preloader 2", w: 1440, h: 889, idea: "Full-bleed image behind the counter, so the land arrives before the name does." },
            { id: "web-preloader-3", title: "Preloader 3", w: 1440, h: 889, idea: "Type-only version. The list of place names scrolls while it loads." },
            { id: "web-preloader-4", title: "Preloader 4", w: 1440, h: 889, idea: "Warm ground with the mark small in the corner, closer to a printed page than a screen." }
          ]
        },
        {
          id: "hero", name: "Hero",
          idea: "The first real screen. Testing whether the photograph or the wordmark should lead.",
          items: [
            { id: "web-hero-1", title: "Hero 1", w: 1440, h: 889, idea: "Photograph does all the work, nav sits over it, no panel." },
            { id: "web-hero-2", title: "Hero 2", w: 1440, h: 889, idea: "Split composition. Landscape left, wordmark and one line of copy right." },
            { id: "web-hero-3", title: "Hero 3", w: 1440, h: 889, idea: "Wordmark oversized against a dark ground, the image reduced to a band." },
            { id: "web-hero-4", title: "Hero 4", w: 1440, h: 889, idea: "Editorial masthead treatment, closer to a newspaper front than a landing page." },
            { id: "web-hero-5", title: "Hero 5", w: 1440, h: 889, idea: "Illustration in place of photography, to see how far the drawn work can carry." }
          ]
        },
        {
          id: "section-banner", name: "Section Banner",
          idea: "The dividers between sections, and how much they should announce themselves.",
          items: [
            { id: "web-section-banner-1", title: "Section Banner 1", w: 1440, h: 573, idea: "Full-width image with a tracked caption sitting on it." },
            { id: "web-section-banner-2", title: "Section Banner 2", w: 1440, h: 573, idea: "Flat colour band, type only, used as a breath between two heavy sections." },
            { id: "web-section-banner-3", title: "Section Banner 3", w: 1440, h: 792, idea: "Taller banner carrying a short statement and one supporting line." }
          ]
        }
      ]
    },
    {
      id: "social", name: "Social",
      groups: [
        {
          id: "motion", name: "Motion",
          idea: "Posts built around movement, either in the photograph or in the layout itself.",
          items: [
            { id: "social-motion-1", title: "Motion 1", w: 1080, h: 1350, idea: "Panned shot, subject sharp against a streaked background." },
            { id: "social-motion-2", title: "Motion 2", w: 1080, h: 1350, idea: "Two frames stacked, the same view a second apart." },
            { id: "social-motion-3", title: "Motion 3", w: 1080, h: 1350, idea: "Type enters from the edge, cropped by the frame." },
            { id: "social-motion-4", title: "Motion 4", w: 1080, h: 1920, idea: "Story format. Full-bleed with the caption low in the safe area." }
          ]
        },
        {
          id: "gradient", name: "Gradient",
          idea: "The atmospheric plates used as grounds, and how much type they can hold.",
          items: [
            { id: "social-gradient-1", title: "Gradient 1", w: 1080, h: 1350, idea: "Season plate with a single line set into the haze." },
            { id: "social-gradient-2", title: "Gradient 2", w: 1080, h: 1350, idea: "Plate used at full bleed with the mark alone, no copy." },
            { id: "social-gradient-3", title: "Gradient 3", w: 1080, h: 1350, idea: "Two plates side by side to show the seasonal shift." }
          ]
        },
        {
          id: "quote", name: "Quote",
          idea: "Copy-led posts where the words are the subject.",
          items: [
            { id: "social-quote-1", title: "Quote 1", w: 1080, h: 1350, idea: "Serif quote centred on paper, credit small beneath." },
            { id: "social-quote-2", title: "Quote 2", w: 1080, h: 1350, idea: "Quote reversed out of a dark photograph." }
          ]
        }
      ]
    },
    {
      id: "paper", name: "Paper",
      groups: [
        {
          id: "letter", name: "Letter",
          idea: "Printed pieces that arrive with the guest. A4, one voice per page.",
          items: [
            { id: "paper-letter-1", title: "Letter 1", w: 595, h: 842, idea: "Welcome letter, wordmark at the head, handwritten sign-off." },
            { id: "paper-letter-2", title: "Letter 2", w: 595, h: 842, idea: "Same letter with the illustration taking the upper third." }
          ]
        }
      ]
    }
  ]
};
