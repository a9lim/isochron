/* ═══════════════════════════════════════════════════════════════
   colors.js — Isochron's ink roles over the shared palette.
   The red is where the mantle reaches the surface (ridge axes, arc
   volcanoes): the theme accent. The ocean's depth is prussian and the
   land's height umber; rules and symbols are the text colour.
   Inks differ per theme, so WebGPU and canvas code read them from
   _themePalette() on every theme change.
   ═══════════════════════════════════════════════════════════════ */

for (const T of [_PALETTE.light, _PALETTE.dark]) {
  T.ocean = T.inks.prussian;
  T.land = T.inks.umber;
}

_freezeTokens();
