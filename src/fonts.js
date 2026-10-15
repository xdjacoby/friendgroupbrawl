// The game's fonts, bundled with the game (npm packages, so they work offline):
//   display  Bangers: comic-book capitals for titles, damage %, KABOOM, P1 tags
//   bubble   Luckiest Guy: chunky cartoon letters for pop-up text and speech bubbles
//   ui       Fredoka: rounded and friendly, for menus and labels
import '@fontsource/bangers';
import '@fontsource/luckiest-guy';
import '@fontsource-variable/fredoka';

export const FONTS = {
  display: '"Bangers", Impact, "Arial Black", sans-serif',
  bubble: '"Luckiest Guy", "Arial Black", Impact, sans-serif',
  ui: '"Fredoka Variable", "Fredoka", system-ui, sans-serif',
};

// Text drawn onto canvases (speech bubbles, pop-ups, signs) is drawn once and
// reused, so the fonts must have arrived before the first match draws any.
export const fontsReady = Promise.all([
  document.fonts.load('64px "Bangers"'),
  document.fonts.load('64px "Luckiest Guy"'),
  document.fonts.load('600 32px "Fredoka Variable"'),
]).catch(() => {});
